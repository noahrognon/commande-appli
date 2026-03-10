import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import { createNotification } from "../../lib/notifications";
import { computeOrderPricing } from "../../lib/orderPricing";
import { getPromoCodeById } from "../../lib/promoCodes";

const SUPABASE_URL = import.meta.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = SUPABASE_SERVICE_ROLE_KEY
	? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
	: null;

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	try {
		if (!adminClient) {
			return new Response(JSON.stringify({ success: false, error: "SUPABASE_SERVICE_ROLE_KEY manquant." }), { status: 500 });
		}

		const authHeader = request.headers.get("authorization") || "";
		const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
		const cookieHeader = request.headers.get("cookie") || "";
		const cookies = Object.fromEntries(
			cookieHeader
				.split(";")
				.map((c) => c.trim().split("="))
				.filter((parts) => parts.length === 2)
				.map(([k, v]) => [k, decodeURIComponent(v)])
		);
		const cookieToken = typeof cookies["sb-access-token"] === "string" ? cookies["sb-access-token"] : "";
		const token = bearerToken || cookieToken;

		if (!token) {
			return new Response(JSON.stringify({ success: false, error: "Non authentifie." }), { status: 401 });
		}

		const { data: userData, error: userError } = await adminClient.auth.getUser(token);
		if (userError || !userData?.user) {
			return new Response(JSON.stringify({ success: false, error: "Session invalide." }), { status: 401 });
		}
		const user = userData.user;

		const body = await request.json();
		const order_id = String(body.order_id || "");
		const cartons = Number(body.cartons || 0);

		if (!order_id) {
			return new Response(JSON.stringify({ success: false, error: "Commande manquante." }), { status: 400 });
		}
		if (cartons < 1) {
			return new Response(JSON.stringify({ success: false, error: "Au moins 1 carton requis." }), { status: 400 });
		}

		const { data: order, error: orderError } = await adminClient
			.from("orders")
			.select("id, user_id, preorder_id, order_number, promo_code_id, promo_code")
			.eq("id", order_id)
			.single();

		if (orderError || !order) {
			return new Response(JSON.stringify({ success: false, error: "Commande introuvable." }), { status: 404 });
		}
		if (order.user_id !== user.id) {
			return new Response(JSON.stringify({ success: false, error: "Acces refuse." }), { status: 403 });
		}

		const { data: preorder, error: preorderError } = await adminClient
			.from("preorders")
			.select("status")
			.eq("id", order.preorder_id)
			.single();

		if (preorderError || !preorder || preorder.status !== "open") {
			return new Response(JSON.stringify({ success: false, error: "Precommande fermee." }), { status: 400 });
		}

		const promo = order.promo_code_id
			? await getPromoCodeById(adminClient, order.promo_code_id)
			: null;
		const pricing = computeOrderPricing({
			cartons,
			promo:
				promo && cartons >= Number(promo.min_cartons || 1) ? promo : null
		});
		const total = pricing.total;
		const promoStillApplied =
			Boolean(promo) && cartons >= Number(promo?.min_cartons || 1);

		const { error: updateError } = await adminClient
			.from("orders")
			.update({
				cartons,
				total,
				promo_code_id: promoStillApplied ? promo?.id : null,
				promo_code: promoStillApplied ? order.promo_code : null,
				promo_discount_amount: pricing.promoDiscountAmount
			})
			.eq("id", order_id);

		if (updateError) {
			return new Response(JSON.stringify({ success: false, error: updateError.message }), { status: 400 });
		}

		if (promo?.id) {
			if (promoStillApplied) {
				await adminClient
					.from("promo_code_usages")
					.update({ discount_amount: pricing.promoDiscountAmount })
					.eq("order_id", order_id);
			} else {
				await adminClient.from("promo_code_usages").delete().eq("order_id", order_id);
			}
		}

		await createNotification(adminClient, {
			userId: user.id,
			type: "order_updated",
			title: "Commande mise a jour",
			message: `Ta commande ${order.order_number || order.id} est maintenant a ${cartons} carton(s).`,
			link: "/profile"
		});

		return new Response(JSON.stringify({ success: true, total }), { status: 200 });
	} catch (e: any) {
		return new Response(JSON.stringify({ success: false, error: e?.message || "Erreur serveur" }), { status: 500 });
	}
};
