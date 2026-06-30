import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { fetchUsersMap } from "../../../lib/userLookup";
import { sendEmail } from "../../../../server/lib/email.js";
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
		return new Response(JSON.stringify({ sentCount: 0, hoursLeft: null }), {
			status: 200,
			headers: { "content-type": "application/json" }
		});
	}

	const endDate = new Date(preorder.end_date);
	const millisecondsLeft = endDate.getTime() - now.getTime();
	const hoursLeft = Math.ceil(millisecondsLeft / (1000 * 60 * 60));

	if (millisecondsLeft <= 0 || hoursLeft > 24) {
		return new Response(JSON.stringify({ sentCount: 0, hoursLeft }), {
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
	const usersMap = await fetchUsersMap(supabaseAdmin);
	const orderByUser = new Map<string, string>();
	for (const order of ordersList) {
		if (!orderByUser.has(order.user_id)) {
			orderByUser.set(order.user_id, order.id);
		}
	}

	let sentCount = 0;
	const emailType = "preorder_reminder_24h";

	for (const [userId, user] of usersMap.entries()) {
		if (!user || !user.email) continue;
		const orderId = orderByUser.get(userId) || null;

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
			hoursLeft: 24,
			preorderName: preorder.name,
			endDate: preorder.end_date
		});

		try {
			await sendEmail({
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

	return new Response(JSON.stringify({ sentCount, hoursLeft }), {
		status: 200,
		headers: { "content-type": "application/json" }
	});
};
