import type { APIRoute } from "astro";
import { getPreorderOpenAnnouncementEmail } from "../../../../lib/emailTemplates";
import { requireAdminRequest } from "../../../../lib/adminGuard";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { fetchUsersMap } from "../../../../lib/userLookup";
import { sendEmail } from "../../../../../server/lib/email.js";

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

	let body: { preorderId?: string } = {};
	try {
		body = (await request.json()) as { preorderId?: string };
	} catch {
		return new Response(JSON.stringify({ error: "Invalid body" }), {
			status: 400,
			headers: { "content-type": "application/json" }
		});
	}

	if (!body.preorderId) {
		return new Response(JSON.stringify({ error: "preorderId required" }), {
			status: 400,
			headers: { "content-type": "application/json" }
		});
	}

	const { data: preorder, error: preorderError } = await supabaseAdmin
		.from("preorders")
		.select("id, name, end_date, status")
		.eq("id", body.preorderId)
		.maybeSingle();

	if (preorderError) {
		return new Response(JSON.stringify({ error: preorderError.message }), {
			status: 400,
			headers: { "content-type": "application/json" }
		});
	}

	if (!preorder) {
		return new Response(JSON.stringify({ error: "Preorder not found" }), {
			status: 404,
			headers: { "content-type": "application/json" }
		});
	}

	const usersMap = await fetchUsersMap(supabaseAdmin);
	let sent = 0;

	for (const [userId, user] of usersMap.entries()) {
		if (!user.email) continue;

		const { data: existing } = await supabaseAdmin
			.from("email_logs")
			.select("id")
			.eq("type", "preorder_open_announcement")
			.eq("user_id", userId)
			.eq("preorder_id", preorder.id)
			.maybeSingle();

		if (existing?.id) continue;

		const emailContent = getPreorderOpenAnnouncementEmail({
			firstName: user.firstName,
			preorderName: preorder.name,
			endDate: preorder.end_date
		});

		try {
			await sendEmail({
				to: user.email,
				subject: emailContent.subject,
				html: emailContent.html,
				text: emailContent.text
			});

			await supabaseAdmin.from("email_logs").insert({
				type: "preorder_open_announcement",
				user_id: userId,
				preorder_id: preorder.id,
				order_id: null
			});

			sent += 1;
		} catch (error) {
			console.error("Preorder open email failed", error);
		}
	}

	return new Response(JSON.stringify({ ok: true, sent }), {
		status: 200,
		headers: { "content-type": "application/json" }
	});
};
