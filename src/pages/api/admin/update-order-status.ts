import type { APIRoute } from "astro";
import { createNotification } from "../../../lib/notifications";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdminRequest } from "../../../lib/adminGuard";
import { fetchUsersMap } from "../../../lib/userLookup";
import { sendEmail } from "../../../../server/lib/email.js";
import { getPaymentPendingEmail, getPaymentValidatedEmail } from "../../../lib/emailTemplates";

export const POST: APIRoute = async ({ request }) => {
	const admin = await requireAdminRequest(request);
	if (!admin) {
		return new Response("Non autorise.", { status: 401 });
	}
	if (!supabaseAdmin) {
		return new Response("Configuration admin manquante.", { status: 500 });
	}

	let payload: { order_id?: string; status?: string } = {};
	try {
		payload = (await request.json()) as { order_id?: string; status?: string };
	} catch {
		return new Response("Payload invalide.", { status: 400 });
	}

	const { order_id, status } = payload;
	const allowed = ["pending", "confirmed", "delivered", "cancelled"];
	if (!order_id || !status || !allowed.includes(status)) {
		return new Response("Parametres invalides.", { status: 400 });
	}

	const { data: order, error: orderFetchError } = await supabaseAdmin
		.from("orders")
		.select("id, user_id, preorder_id, order_number, total, payment_method")
		.eq("id", order_id)
		.maybeSingle();
	if (orderFetchError || !order) {
		return new Response("Commande introuvable.", { status: 404 });
	}

	const updatePayload: Record<string, string | null> = { status };
	if (status === "confirmed" && order.payment_method === "virement") {
		updatePayload.payment_proof_status = "valid";
		updatePayload.payment_proof_rejection_reason = null;
		updatePayload.payment_proof_reviewed_at = new Date().toISOString();
	}

	const { error } = await supabaseAdmin.from("orders").update(updatePayload).eq("id", order_id);
	if (error) {
		return new Response(error.message, { status: 400 });
	}

	const statusMessages: Record<string, { title: string; message: string }> = {
		pending: {
			title: "Commande en attente",
			message: `Ta commande ${order.order_number || order.id} est repassee en attente.`
		},
		confirmed: {
			title: "Commande confirmee",
			message: `Ta commande ${order.order_number || order.id} a ete confirmee.`
		},
		delivered: {
			title: "Commande livree",
			message: `Ta commande ${order.order_number || order.id} est marquee comme livree.`
		},
		cancelled: {
			title: "Commande annulee",
			message: `Ta commande ${order.order_number || order.id} a ete annulee.`
		}
	};

	await createNotification(supabaseAdmin, {
		userId: order.user_id,
		type: `order_status_${status}`,
		title: statusMessages[status]?.title || "Statut mis a jour",
		message: statusMessages[status]?.message || `Le statut de ta commande ${order.order_number || order.id} a change.`,
		link: "/profile"
	});

	if (status === "confirmed" || status === "pending") {
		const logType = status === "confirmed" ? `payment_validated_${order.id}` : `payment_pending_${order.id}`;
		const { data: existingLog } = await supabaseAdmin
			.from("email_logs")
			.select("id")
			.eq("type", logType)
			.eq("user_id", order.user_id)
			.eq("order_id", order.id)
			.maybeSingle();

		if (!existingLog?.id) {
			const usersMap = await fetchUsersMap(supabaseAdmin);
			const user = usersMap.get(order.user_id);

			if (user?.email) {
				try {
					const emailContent =
						status === "confirmed"
							? getPaymentValidatedEmail({
									firstName: user.firstName,
									orderNumber: order.order_number || order.id
								})
							: getPaymentPendingEmail({
									firstName: user.firstName,
									orderNumber: order.order_number || order.id,
									total: Number(order.total || 0),
									paymentMethod: order.payment_method
								});

					await sendEmail({
						to: user.email,
						subject: emailContent.subject,
						html: emailContent.html,
						text: emailContent.text
					});

					const { error: logError } = await supabaseAdmin.from("email_logs").insert({
						type: logType,
						user_id: order.user_id,
						preorder_id: order.preorder_id,
						order_id: order.id
					});
					if (logError) {
						console.error("Order status email log insert failed", logError);
					}
				} catch (mailError) {
					console.error("Order status email failed", mailError);
				}
			}
		}
	}

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: {
			"content-type": "application/json"
		}
	});
};
