import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

const json = (body: Record<string, unknown>, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" }
	});

const getTokenFromRequest = (request: Request) => {
	const authHeader = request.headers.get("authorization") || "";
	const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
	if (bearerToken) return bearerToken;

	const cookieHeader = request.headers.get("cookie") || "";
	const cookies = Object.fromEntries(
		cookieHeader
			.split(";")
			.map((c) => c.trim().split("="))
			.filter((parts) => parts.length === 2)
			.map(([k, v]) => [k, decodeURIComponent(v)])
	);
	return typeof cookies["sb-access-token"] === "string" ? cookies["sb-access-token"] : "";
};

export const POST: APIRoute = async ({ request }) => {
	if (!supabaseAdmin) return json({ success: false, error: "Configuration Supabase manquante." }, 500);

	const token = getTokenFromRequest(request);
	if (!token) return json({ success: false, error: "Non authentifie." }, 401);

	const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
	const user = userData?.user;
	if (userError || !user) return json({ success: false, error: "Session invalide." }, 401);

	const body = await request.json().catch(() => null);
	const orderId = String(body?.order_id || "");
	const proofPath = String(body?.payment_proof_path || "").trim();
	if (!orderId || !proofPath) return json({ success: false, error: "Preuve manquante." }, 400);
	if (!proofPath.startsWith(`${user.id}/`)) return json({ success: false, error: "Preuve invalide." }, 400);

	const { data: order, error: orderError } = await supabaseAdmin
		.from("orders")
		.select("id, user_id, payment_method, status")
		.eq("id", orderId)
		.eq("user_id", user.id)
		.maybeSingle();

	if (orderError || !order) return json({ success: false, error: "Commande introuvable." }, 404);
	if (order.payment_method !== "virement") return json({ success: false, error: "Commande sans virement." }, 400);
	if (order.status === "delivered" || order.status === "cancelled") {
		return json({ success: false, error: "Cette commande ne peut plus etre modifiee." }, 400);
	}

	const { error: updateError } = await supabaseAdmin
		.from("orders")
		.update({
			payment_proof_path: proofPath,
			payment_proof_uploaded_at: new Date().toISOString(),
			payment_proof_status: "pending",
			payment_proof_rejection_reason: null,
			payment_proof_reviewed_at: null,
			status: "pending"
		})
		.eq("id", order.id);

	if (updateError) return json({ success: false, error: updateError.message }, 400);
	return json({ success: true });
};
