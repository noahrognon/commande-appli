import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { fetchUsersMap } from "../../../lib/userLookup";
import { sendMail } from "../../../lib/mailer";
import { getPreorderReminderEmail } from "../../../lib/emailTemplates";

export const GET: APIRoute = async () => {
	if (!supabaseAdmin) {
		return new Response(JSON.stringify({ sentCount: 0, error: "Missing admin client." }), {
			status: 500
		});
	}

	const now = new Date();

	const { data: preorder } = await supabaseAdmin
		.from("preorders")
		.select("id, name, end_date, status")
		.eq("status", "open")
		.gt("end_date", now.toISOString())
		.maybeSingle();

	if (!preorder) {
		return new Response(JSON.stringify({ sentCount: 0, daysLeft: null }), {
			status: 200,
			headers: { "content-type": "application/json" }
		});
	}

	const endDate = new Date(preorder.end_date);
	const daysLeft = Math.floor((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

	if (![1, 2, 3].includes(daysLeft)) {
		return new Response(JSON.stringify({ sentCount: 0, daysLeft }), {
			status: 200,
			headers: { "content-type": "application/json" }
		});
	}

	const { data: orders } = await supabaseAdmin
		.from("orders")
		.select("id, user_id")
		.eq("preorder_id", preorder.id)
		.neq("status", "cancelled");

	const ordersList = orders ?? [];
	if (ordersList.length === 0) {
		return new Response(JSON.stringify({ sentCount: 0, daysLeft }), {
			status: 200,
			headers: { "content-type": "application/json" }
		});
	}

	const usersMap = await fetchUsersMap(supabaseAdmin);
	const orderByUser = new Map<string, string>();
	for (const order of ordersList) {
		if (!orderByUser.has(order.user_id)) {
			orderByUser.set(order.user_id, order.id);
		}
	}

	let sentCount = 0;
	const emailType = `preorder_reminder_${daysLeft}d`;

	for (const [userId, orderId] of orderByUser.entries()) {
		const user = usersMap.get(userId);
		if (!user || !user.email) continue;

		const { data: existing } = await supabaseAdmin
			.from("email_logs")
			.select("id")
			.eq("type", emailType)
			.eq("user_id", userId)
			.eq("preorder_id", preorder.id)
			.maybeSingle();

		if (existing?.id) continue;

		const emailContent = getPreorderReminderEmail({
			firstName: user.firstName,
			daysLeft,
			preorderName: preorder.name,
			endDate: preorder.end_date
		});

		try {
			await sendMail({
				to: user.email,
				subject: emailContent.subject,
				html: emailContent.html,
				text: emailContent.text
			});

			await supabaseAdmin.from("email_logs").insert({
				type: emailType,
				user_id: userId,
				preorder_id: preorder.id,
				order_id: orderId
			});

			sentCount += 1;
		} catch (error) {
			console.error("Reminder email failed", error);
		}
	}

	return new Response(JSON.stringify({ sentCount, daysLeft }), {
		status: 200,
		headers: { "content-type": "application/json" }
	});
};
