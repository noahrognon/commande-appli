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

	const { error } = await supabaseAdmin.from("orders").update({ status }).eq("id", order_id);
	if (error) {
		return new Response(error.message, { status: 400 });
	}

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: {
			"content-type": "application/json"
		}
	});
};
