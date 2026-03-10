import type { APIRoute } from "astro";
import { createNotification } from "../../../lib/notifications";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdminRequest } from "../../../lib/adminGuard";

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
		.select("id, user_id, order_number")
		.eq("id", order_id)
		.maybeSingle();
	if (orderFetchError || !order) {
		return new Response("Commande introuvable.", { status: 404 });
	}

	const { error } = await supabaseAdmin.from("orders").update({ status }).eq("id", order_id);
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

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: {
			"content-type": "application/json"
		}
	});
};
