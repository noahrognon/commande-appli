import type { APIRoute } from "astro";
import { sendEmail } from "../../../../server/lib/email.js";
import { requireAdminRequest } from "../../../lib/adminGuard";
import { getPaymentProofRejectedEmail } from "../../../lib/emailTemplates";
import { createNotification } from "../../../lib/notifications";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { fetchUsersMap } from "../../../lib/userLookup";

export const POST: APIRoute = async ({ request }) => {
	const admin = await requireAdminRequest(request);
	if (!admin) {
		return new Response("Non autorise.", { status: 401 });
	}
	if (!supabaseAdmin) {
		return new Response("Configuration admin manquante.", { status: 500 });
	}

	let payload: { order_id?: string; reason?: string } = {};
	try {
		payload = (await request.json()) as { order_id?: string; reason?: string };
	} catch {
		return new Response("Payload invalide.", { status: 400 });
	}

	const orderId = payload.order_id;
	const reason = String(payload.reason || "").trim();
	if (!orderId) {
		return new Response("Commande manquante.", { status: 400 });
	}

	const { data: order, error: orderError } = await supabaseAdmin
		.from("orders")
		.select("id, user_id, preorder_id, order_number, payment_method")
		.eq("id", orderId)
		.maybeSingle();

	if (orderError || !order) {
		return new Response("Commande introuvable.", { status: 404 });
	}
	if (order.payment_method !== "virement") {
		return new Response("Cette action concerne uniquement les virements.", { status: 400 });
	}

	const rejectionReason = reason || "Preuve illisible, montant incorrect ou reference manquante.";
	const { error: updateError } = await supabaseAdmin
		.from("orders")
		.update({
			status: "pending",
			payment_proof_status: "invalid",
			payment_proof_rejection_reason: rejectionReason,
			payment_proof_reviewed_at: new Date().toISOString()
		})
		.eq("id", order.id);

	if (updateError) {
		return new Response(updateError.message, { status: 400 });
	}

	await createNotification(supabaseAdmin, {
		userId: order.user_id,
		type: "payment_proof_rejected",
		title: "Preuve de paiement refusee",
		message: `La preuve de paiement de ta commande ${order.order_number || order.id} doit etre renvoyee. ${rejectionReason}`,
		link: "/profile"
	});

	const usersMap = await fetchUsersMap(supabaseAdmin);
	const user = usersMap.get(order.user_id);
	if (user?.email) {
		try {
			const emailContent = getPaymentProofRejectedEmail({
				firstName: user.firstName,
				orderNumber: order.order_number || order.id,
				reason: rejectionReason
			});
			await sendEmail({
				to: user.email,
				subject: emailContent.subject,
				html: emailContent.html,
				text: emailContent.text
			});

			const { error: logError } = await supabaseAdmin.from("email_logs").insert({
				type: `payment_proof_rejected_${order.id}`,
				user_id: order.user_id,
				preorder_id: order.preorder_id,
				order_id: order.id
			});
			if (logError) {
				console.error("Payment proof rejected email log insert failed", logError);
			}
		} catch (mailError) {
			console.error("Payment proof rejected email failed", mailError);
		}
	}

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: { "content-type": "application/json" }
	});
};
