import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import { validatePromoCode } from "../../lib/promoCodes";

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

		const body = (await request.json()) as { code?: string; cartons?: number };
		const code = String(body.code || "");
		const cartons = Number(body.cartons || 0);

		if (!code) {
			return new Response(JSON.stringify({ success: false, error: "Code promo manquant." }), { status: 400 });
		}
		if (cartons < 1) {
			return new Response(JSON.stringify({ success: false, error: "Quantite invalide." }), { status: 400 });
		}

		const result = await validatePromoCode({
			client: adminClient,
			code,
			cartons
		});

		if (!result.ok) {
			return new Response(JSON.stringify({ success: false, error: result.error }), { status: 400 });
		}

		return new Response(
			JSON.stringify({
				success: true,
				code: result.promo.code,
				type: result.promo.type,
				value: result.promo.value,
				min_cartons: result.promo.min_cartons,
				pricing: result.pricing
			}),
			{ status: 200 },
		);
	} catch (error: any) {
		return new Response(JSON.stringify({ success: false, error: error?.message || "Erreur serveur" }), { status: 500 });
	}
};
