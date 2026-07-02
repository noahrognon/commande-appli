import type { APIRoute } from "astro";
import { requireAdminRequest } from "../../../lib/adminGuard";
import { buildCampaignEmail } from "../../../lib/emailCampaigns";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { fetchUsersMap, type UserInfo } from "../../../lib/userLookup";
import { sendEmail } from "../../../../server/lib/email.js";

type CampaignAudience =
	| "all"
	| "without_current_order"
	| "with_current_order"
	| "previous_buyers"
	| "selected";

type CampaignBody = {
	mode?: "test" | "send";
	subject?: string;
	message?: string;
	ctaLabel?: string;
	ctaUrl?: string;
	audience?: CampaignAudience;
	selectedUserIds?: string[];
	testEmail?: string;
};

const json = (payload: Record<string, unknown>, status = 200) =>
	new Response(JSON.stringify(payload), {
		status,
		headers: { "content-type": "application/json" }
	});

const getOpenPreorder = async () => {
	const { data } = await supabaseAdmin!
		.from("preorders")
		.select("id, name, end_date, status")
		.eq("status", "open")
		.maybeSingle();
	return data;
};

const getRecipientUsers = async (
	audience: CampaignAudience,
	selectedUserIds: string[],
	openPreorderId?: string
) => {
	const usersMap = await fetchUsersMap(supabaseAdmin!);
	const users = Array.from(usersMap.values()).filter((user) => user.email);

	const { data: orders } = await supabaseAdmin!
		.from("orders")
		.select("user_id, preorder_id");

	const allOrders = orders ?? [];
	const buyers = new Set(allOrders.map((order: any) => order.user_id));
	const currentBuyers = new Set(
		openPreorderId
			? allOrders
					.filter((order: any) => order.preorder_id === openPreorderId)
					.map((order: any) => order.user_id)
			: []
	);
	const selected = new Set(selectedUserIds);

	if (audience === "selected") {
		return users.filter((user) => selected.has(user.id));
	}

	if (audience === "without_current_order") {
		return users.filter((user) => !currentBuyers.has(user.id));
	}

	if (audience === "with_current_order") {
		return users.filter((user) => currentBuyers.has(user.id));
	}

	if (audience === "previous_buyers") {
		return users.filter((user) => buyers.has(user.id));
	}

	return users;
};

const insertRecipientLog = async (params: {
	campaignId: string;
	user: UserInfo;
	status: "sent" | "failed";
	error?: string;
}) => {
	await supabaseAdmin!.from("email_campaign_recipients").insert({
		campaign_id: params.campaignId,
		user_id: params.user.id,
		email: params.user.email,
		first_name: params.user.firstName || null,
		last_name: params.user.lastName || null,
		status: params.status,
		error: params.error || null,
		sent_at: params.status === "sent" ? new Date().toISOString() : null
	});
};

export const POST: APIRoute = async ({ request }) => {
	if (!supabaseAdmin) {
		return json({ error: "Missing admin client." }, 500);
	}

	const admin = await requireAdminRequest(request);
	if (!admin) {
		return json({ error: "Forbidden" }, 403);
	}

	let body: CampaignBody;
	try {
		body = (await request.json()) as CampaignBody;
	} catch {
		return json({ error: "Invalid body" }, 400);
	}

	const subject = String(body.subject || "").trim();
	const message = String(body.message || "").trim();
	const ctaLabel = String(body.ctaLabel || "").trim();
	const ctaUrl = String(body.ctaUrl || "").trim();
	const mode = body.mode === "test" ? "test" : "send";
	const audience = (body.audience || "all") as CampaignAudience;
	const selectedUserIds = Array.isArray(body.selectedUserIds) ? body.selectedUserIds : [];

	if (!subject || !message) {
		return json({ error: "Objet et message obligatoires." }, 400);
	}

	if ((ctaLabel && !ctaUrl) || (!ctaLabel && ctaUrl)) {
		return json({ error: "Le bouton CTA doit avoir un libelle et un lien." }, 400);
	}

	const openPreorder = await getOpenPreorder();

	if (mode === "test") {
		const to = String(body.testEmail || admin.email || "").trim();
		if (!to) return json({ error: "Email de test manquant." }, 400);
		const testEmail = buildCampaignEmail({
			subject,
			message,
			ctaLabel,
			ctaUrl,
			user: {
				firstName: "Noah",
				lastName: "Test",
				email: to
			},
			preorder: {
				name: openPreorder?.name,
				endDate: openPreorder?.end_date
			}
		});

		await sendEmail({
			to,
			subject: `[Test] ${testEmail.subject}`,
			html: testEmail.html,
			text: testEmail.text
		});

		return json({ ok: true, sent: 1 });
	}

	const recipients = await getRecipientUsers(
		audience,
		selectedUserIds,
		openPreorder?.id
	);

	if (recipients.length === 0) {
		return json({ error: "Aucun destinataire trouve pour cette audience." }, 400);
	}

	const { data: campaign, error: campaignError } = await supabaseAdmin
		.from("email_campaigns")
		.insert({
			type: "custom",
			subject,
			message,
			cta_label: ctaLabel || null,
			cta_url: ctaUrl || null,
			audience,
			preorder_id: openPreorder?.id || null,
			sent_by_email: admin.email,
			recipient_count: recipients.length,
			success_count: 0,
			failure_count: 0
		})
		.select("id")
		.single();

	if (campaignError || !campaign?.id) {
		return json(
			{
				error:
					campaignError?.message ||
					"Impossible de creer l'historique de campagne. Applique le SQL email-campaigns."
			},
			400
		);
	}

	let sent = 0;
	let failed = 0;

	for (const user of recipients) {
		const emailContent = buildCampaignEmail({
			subject,
			message,
			ctaLabel,
			ctaUrl,
			user,
			preorder: {
				name: openPreorder?.name,
				endDate: openPreorder?.end_date
			}
		});

		try {
			await sendEmail({
				to: user.email,
				subject: emailContent.subject,
				html: emailContent.html,
				text: emailContent.text
			});
			sent += 1;
			await insertRecipientLog({
				campaignId: campaign.id,
				user,
				status: "sent"
			});
		} catch (error) {
			failed += 1;
			await insertRecipientLog({
				campaignId: campaign.id,
				user,
				status: "failed",
				error: error instanceof Error ? error.message : "Envoi impossible"
			});
			console.error("Campaign email failed", error);
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

	return json({ ok: true, sent, failed, campaignId: campaign.id });
};
