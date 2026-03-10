import type { APIRoute } from "astro";
import { requireAdminRequest } from "../../../lib/adminGuard";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const POST: APIRoute = async ({ request }) => {
	if (!supabaseAdmin) {
		return new Response(JSON.stringify({ error: "Missing admin client." }), {
			status: 500,
			headers: { "content-type": "application/json" }
		});
	}

	const admin = await requireAdminRequest(request);
	if (!admin) {
		return new Response(JSON.stringify({ error: "Forbidden" }), {
			status: 403,
			headers: { "content-type": "application/json" }
		});
	}

	let body: { promoId?: string; is_active?: boolean } = {};
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return new Response(JSON.stringify({ error: "Invalid body" }), {
			status: 400,
			headers: { "content-type": "application/json" }
		});
	}

	const promoId = String(body.promoId || "");
	if (!promoId || typeof body.is_active !== "boolean") {
		return new Response(JSON.stringify({ error: "promoId et is_active requis." }), {
			status: 400,
			headers: { "content-type": "application/json" }
		});
	}

	const { data, error } = await supabaseAdmin
		.from("promo_codes")
		.update({ is_active: body.is_active })
		.eq("id", promoId)
		.select("id, is_active")
		.single();

	if (error) {
		return new Response(JSON.stringify({ error: error.message }), {
			status: 400,
			headers: { "content-type": "application/json" }
		});
	}

	return new Response(JSON.stringify({ ok: true, promo: data }), {
		status: 200,
		headers: { "content-type": "application/json" }
	});
};
