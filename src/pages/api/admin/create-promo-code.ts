import type { APIRoute } from "astro";
import { requireAdminRequest } from "../../../lib/adminGuard";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { normalizePromoCode } from "../../../lib/promoCodes";

const validTypes = new Set(["fixed", "percent"]);

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

	let body: {
		code?: string;
		type?: string;
		value?: number | string;
		min_cartons?: number | string;
		max_uses?: number | string | null;
		starts_at?: string;
		ends_at?: string;
		is_active?: boolean;
	} = {};

	try {
		body = (await request.json()) as typeof body;
	} catch {
		return new Response(JSON.stringify({ error: "Invalid body" }), {
			status: 400,
			headers: { "content-type": "application/json" }
		});
	}

	const code = normalizePromoCode(String(body.code || ""));
	const type = String(body.type || "");
	const value = Number(body.value || 0);
	const min_cartons = Math.max(1, Number(body.min_cartons || 1));
	const maxUsesRaw = String(body.max_uses ?? "").trim();
	const max_uses = maxUsesRaw ? Math.max(1, Number(maxUsesRaw)) : null;
	const starts_at = String(body.starts_at || "").trim() || null;
	const ends_at = String(body.ends_at || "").trim() || null;
	const is_active = body.is_active !== false;

	if (!code || !validTypes.has(type)) {
		return new Response(JSON.stringify({ error: "Code ou type invalide." }), {
			status: 400,
			headers: { "content-type": "application/json" }
		});
	}

	if (!Number.isFinite(value) || value <= 0) {
		return new Response(JSON.stringify({ error: "Valeur promo invalide." }), {
			status: 400,
			headers: { "content-type": "application/json" }
		});
	}

	if (type === "percent" && value > 100) {
		return new Response(JSON.stringify({ error: "Un pourcentage ne peut pas depasser 100." }), {
			status: 400,
			headers: { "content-type": "application/json" }
		});
	}

	const { data, error } = await supabaseAdmin
		.from("promo_codes")
		.insert({
			code,
			type,
			value,
			min_cartons,
			max_uses,
			starts_at: starts_at ? new Date(starts_at).toISOString() : null,
			ends_at: ends_at ? new Date(ends_at).toISOString() : null,
			is_active
		})
		.select(
			"id, code, type, value, min_cartons, max_uses, is_active, starts_at, ends_at, created_at"
		)
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
