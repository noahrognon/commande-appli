import type { APIRoute } from "astro";
import { requireAdminRequest } from "../../../lib/adminGuard";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

const validStatuses = new Set(["planned", "open", "closed"]);

export const POST: APIRoute = async ({ request }) => {
	if (!supabaseAdmin) {
		return new Response("Missing admin client.", { status: 500 });
	}

	const admin = await requireAdminRequest(request);
	if (!admin) {
		return new Response("Forbidden", { status: 403 });
	}

	let body: { preorderId?: string; status?: string } = {};
	try {
		body = (await request.json()) as { preorderId?: string; status?: string };
	} catch {
		return new Response("Invalid body", { status: 400 });
	}

	const preorderId = body.preorderId || "";
	const status = body.status || "";

	if (!preorderId || !validStatuses.has(status)) {
		return new Response("preorderId and valid status are required", { status: 400 });
	}

	if (status === "open") {
		const { error: closeError } = await supabaseAdmin
			.from("preorders")
			.update({ status: "closed" })
			.eq("status", "open")
			.neq("id", preorderId);

		if (closeError) {
			return new Response(closeError.message, { status: 400 });
		}
	}

	const { data, error } = await supabaseAdmin
		.from("preorders")
		.update({ status })
		.eq("id", preorderId)
		.select("id, status")
		.single();

	if (error) {
		return new Response(error.message, { status: 400 });
	}

	return new Response(JSON.stringify({ ok: true, preorder: data }), {
		status: 200,
		headers: { "content-type": "application/json" }
	});
};
