import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { getAdminFromRequest } from "../../../lib/adminAuth";

export const POST: APIRoute = async ({ request }) => {
	const admin = await getAdminFromRequest(request);
	if (!admin) {
		return new Response("Non autorise.", { status: 401 });
	}
	if (!supabaseAdmin) {
		return new Response("Configuration admin manquante.", { status: 500 });
	}

	const { data: openPreorder, error } = await supabaseAdmin
		.from("preorders")
		.select("id, end_date")
		.eq("status", "open")
		.maybeSingle();

	if (error) {
		return new Response(error.message, { status: 400 });
	}
	if (!openPreorder) {
		return new Response(JSON.stringify({ success: false, message: "Aucune precommande ouverte." }), {
			status: 200,
			headers: { "content-type": "application/json" }
		});
	}

	const currentEnd = new Date(openPreorder.end_date);
	const nextEnd = new Date(currentEnd.getTime() + 24 * 60 * 60 * 1000);

	const { error: updateError } = await supabaseAdmin
		.from("preorders")
		.update({ end_date: nextEnd.toISOString() })
		.eq("id", openPreorder.id);

	if (updateError) {
		return new Response(updateError.message, { status: 400 });
	}

	return new Response(
		JSON.stringify({ success: true, end_date: nextEnd.toISOString() }),
		{
			status: 200,
			headers: { "content-type": "application/json" }
		}
	);
};
