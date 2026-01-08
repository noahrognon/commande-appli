import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

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
			.select("id, user_id, preorder_id")
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

		let discountPct = 0;
		if (cartons >= 10) discountPct = 10;
		else if (cartons >= 5) discountPct = 7;
		else if (cartons >= 3) discountPct = 4;
		const total = Math.round(cartons * 75 * (1 - discountPct / 100));

		const { error: updateError } = await adminClient
			.from("orders")
			.update({ cartons, total })
			.eq("id", order_id);

		if (updateError) {
			return new Response(JSON.stringify({ success: false, error: updateError.message }), { status: 400 });
		}

		return new Response(JSON.stringify({ success: true, total }), { status: 200 });
	} catch (e: any) {
		return new Response(JSON.stringify({ success: false, error: e?.message || "Erreur serveur" }), { status: 500 });
	}
};
