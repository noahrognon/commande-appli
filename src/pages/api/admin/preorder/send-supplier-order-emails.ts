import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { requireAdminRequest } from "../../../../lib/adminGuard";
import { fetchUsersMap } from "../../../../lib/userLookup";
import { sendMail } from "../../../../lib/mailer";
import { getSupplierOrderSentEmail } from "../../../../lib/emailTemplates";

export const POST: APIRoute = async ({ request }) => {
	if (!supabaseAdmin) {
		return new Response("Missing admin client.", { status: 500 });
	}

	const admin = await requireAdminRequest(request);
	if (!admin) {
		return new Response("Forbidden", { status: 403 });
	}

	let body: { preorderId?: string } = {};
	try {
		body = (await request.json()) as { preorderId?: string };
	} catch {
		return new Response("Invalid body", { status: 400 });
	}

	const preorderId = body.preorderId;
	if (!preorderId) {
		return new Response("preorderId required", { status: 400 });
	}

	const { data: preorder } = await supabaseAdmin
		.from("preorders")
		.select("id, name")
		.eq("id", preorderId)
		.maybeSingle();

	if (!preorder) {
		return new Response("Preorder not found", { status: 404 });
	}

	const { data: orders } = await supabaseAdmin
		.from("orders")
		.select("id, user_id")
		.eq("preorder_id", preorderId)
		.in("status", ["pending", "confirmed"]);

	const ordersList = orders ?? [];
	if (ordersList.length === 0) {
		return new Response(JSON.stringify({ ok: true, sent: 0 }), {
			status: 200,
			headers: { "content-type": "application/json" }
		});
	}

	const usersMap = await fetchUsersMap(supabaseAdmin);
	const orderByUser = new Map<string, string>();
	for (const order of ordersList) {
		if (!orderByUser.has(order.user_id)) orderByUser.set(order.user_id, order.id);
	}

	let sent = 0;
	for (const [userId, orderId] of orderByUser.entries()) {
		const user = usersMap.get(userId);
		if (!user || !user.email) continue;

		const { data: existing } = await supabaseAdmin
			.from("email_logs")
			.select("id")
			.eq("type", "supplier_order_sent")
			.eq("user_id", userId)
			.eq("preorder_id", preorderId)
			.maybeSingle();

		if (existing?.id) continue;

		const emailContent = getSupplierOrderSentEmail({
			firstName: user.firstName,
			preorderName: preorder.name,
			etaInDays: 14
		});

		try {
			await sendMail({
				to: user.email,
				subject: emailContent.subject,
				html: emailContent.html,
				text: emailContent.text
			});

			await supabaseAdmin.from("email_logs").insert({
				type: "supplier_order_sent",
				user_id: userId,
				preorder_id: preorderId,
				order_id: orderId
			});

			sent += 1;
		} catch (error) {
			console.error("Supplier email failed", error);
		}
	}

	return new Response(JSON.stringify({ ok: true, sent }), {
		status: 200,
		headers: { "content-type": "application/json" }
	});
};
