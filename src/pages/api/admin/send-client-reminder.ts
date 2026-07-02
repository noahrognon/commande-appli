import type { APIRoute } from "astro";
import { requireAdminRequest } from "../../../lib/adminGuard";
import { getNoOrderReminderEmail } from "../../../lib/emailCampaigns";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { fetchUsersMap } from "../../../lib/userLookup";
import { sendEmail } from "../../../../server/lib/email.js";

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
		body = {};
	}

	const { data: preorder, error: preorderError } = await supabaseAdmin
		.from("preorders")
		.select("id, name, end_date, status")
		.eq(body.preorderId ? "id" : "status", body.preorderId || "open")
		.maybeSingle();

	if (preorderError) {
		return new Response(JSON.stringify({ error: preorderError.message }), {
			status: 400,
			headers: { "content-type": "application/json" }
		});
	}

	if (!preorder) {
		return new Response(JSON.stringify({ error: "Aucune vague ouverte." }), {
			status: 400,
			headers: { "content-type": "application/json" }
		});
	}

	const usersMap = await fetchUsersMap(supabaseAdmin);
	const { data: currentOrders, error: ordersError } = await supabaseAdmin
		.from("orders")
		.select("user_id")
		.eq("preorder_id", preorder.id);

	if (ordersError) {
		return new Response(JSON.stringify({ error: ordersError.message }), {
			status: 400,
			headers: { "content-type": "application/json" }
		});
	}

	const orderedUserIds = new Set((currentOrders ?? []).map((order: any) => order.user_id));
	const recipients = Array.from(usersMap.values()).filter(
		(user) => user.email && !orderedUserIds.has(user.id)
	);

	if (recipients.length === 0) {
		return new Response(JSON.stringify({ ok: true, sent: 0, failed: 0 }), {
			status: 200,
			headers: { "content-type": "application/json" }
		});
	}

	const preview = getNoOrderReminderEmail({
		firstName: recipients[0]?.firstName,
		lastName: recipients[0]?.lastName,
		preorderName: preorder.name,
		endDate: preorder.end_date
	});

	const { data: campaign, error: campaignError } = await supabaseAdmin
		.from("email_campaigns")
		.insert({
			type: "no_order_reminder",
			subject: preview.subject,
			message:
				"Salut {{prenom}}, petite relance avant fermeture : la vague de precommande ferme bientot. Si tu veux securiser ton stock, c'est le bon moment. Apres, la commande part fournisseur et on ne pourra plus ajouter de cartons a cette vague.",
			cta_label: "Commander avant fermeture",
			cta_url: "/precommande",
			audience: "without_current_order",
			preorder_id: preorder.id,
			sent_by_email: admin.email,
			recipient_count: recipients.length,
			success_count: 0,
			failure_count: 0
		})
		.select("id")
		.single();

	if (campaignError || !campaign?.id) {
		return new Response(
			JSON.stringify({
				error:
					campaignError?.message ||
					"Impossible de creer l'historique de campagne. Applique le SQL email-campaigns."
			}),
			{ status: 400, headers: { "content-type": "application/json" } }
		);
	}

	let sent = 0;
	let failed = 0;

	for (const user of recipients) {
		const emailContent = getNoOrderReminderEmail({
			firstName: user.firstName,
			lastName: user.lastName,
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
			sent += 1;
			await supabaseAdmin.from("email_campaign_recipients").insert({
				campaign_id: campaign.id,
				user_id: user.id,
				email: user.email,
				first_name: user.firstName || null,
				last_name: user.lastName || null,
				status: "sent",
				sent_at: new Date().toISOString()
			});
		} catch (error) {
			failed += 1;
			await supabaseAdmin.from("email_campaign_recipients").insert({
				campaign_id: campaign.id,
				user_id: user.id,
				email: user.email,
				first_name: user.firstName || null,
				last_name: user.lastName || null,
				status: "failed",
				error: error instanceof Error ? error.message : "Envoi impossible"
			});
			console.error("Client reminder email failed", error);
		}
	}

	await supabaseAdmin
		.from("email_campaigns")
		.update({
			success_count: sent,
			failure_count: failed,
			sent_at: new Date().toISOString()
		})
		.eq("id", campaign.id);

	return new Response(JSON.stringify({ ok: true, sent, failed }), {
		status: 200,
		headers: { "content-type": "application/json" }
	});
};
