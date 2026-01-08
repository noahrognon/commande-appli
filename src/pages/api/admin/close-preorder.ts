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
		.select("id")
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

	const { error: updateError } = await supabaseAdmin
		.from("preorders")
		.update({ status: "closed" })
		.eq("id", openPreorder.id);

	if (updateError) {
		return new Response(updateError.message, { status: 400 });
	}

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: { "content-type": "application/json" }
	});
};
