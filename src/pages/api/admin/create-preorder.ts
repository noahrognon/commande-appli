import type { APIRoute } from "astro";
import { requireAdminRequest } from "../../../lib/adminGuard";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

const validStatuses = new Set(["planned", "open", "closed"]);

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
		name?: string;
		start_date?: string;
		end_date?: string;
		status?: string;
	} = {};

	try {
		body = (await request.json()) as typeof body;
	} catch {
		return new Response(JSON.stringify({ error: "Invalid body" }), {
			status: 400,
			headers: { "content-type": "application/json" }
		});
	}

	const name = String(body.name || "").trim();
	const start_date = String(body.start_date || "").trim();
	const end_date = String(body.end_date || "").trim();
	const status = String(body.status || "").trim() || "planned";

	if (!name || !start_date || !end_date) {
		return new Response(JSON.stringify({ error: "name, start_date and end_date are required" }), {
			status: 400,
			headers: { "content-type": "application/json" }
		});
	}

	if (!validStatuses.has(status)) {
		return new Response(JSON.stringify({ error: "Invalid status" }), {
			status: 400,
			headers: { "content-type": "application/json" }
		});
	}

	const start = new Date(start_date);
	const end = new Date(end_date);

	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		return new Response(JSON.stringify({ error: "Invalid dates" }), {
			status: 400,
			headers: { "content-type": "application/json" }
		});
	}

	if (end <= start) {
		return new Response(JSON.stringify({ error: "End date must be after start date" }), {
			status: 400,
			headers: { "content-type": "application/json" }
		});
	}

	if (status === "open") {
		const { error: closeError } = await supabaseAdmin
			.from("preorders")
			.update({ status: "closed" })
			.eq("status", "open");

		if (closeError) {
			return new Response(JSON.stringify({ error: closeError.message }), {
				status: 400,
				headers: { "content-type": "application/json" }
			});
		}
	}

	const { data, error } = await supabaseAdmin
		.from("preorders")
		.insert({
			name,
			start_date: start.toISOString(),
			end_date: end.toISOString(),
			status
		})
		.select("id, name, start_date, end_date, status")
		.single();

	if (error) {
		return new Response(JSON.stringify({ error: error.message }), {
			status: 400,
			headers: { "content-type": "application/json" }
		});
	}

	return new Response(JSON.stringify({ ok: true, preorder: data }), {
		status: 200,
		headers: { "content-type": "application/json" }
	});
};
