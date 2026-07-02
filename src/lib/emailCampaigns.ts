const siteUrl = (import.meta.env.PUBLIC_SITE_URL || "https://commande.noahrognon.fr")
	.toString()
	.replace(/\/$/, "");

type CampaignUser = {
	firstName?: string;
	lastName?: string;
	email?: string;
};

type CampaignPreorder = {
	name?: string;
	endDate?: string;
};

const escapeHtml = (value: string) =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

const formatDate = (value?: string) => {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString("fr-FR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric"
	});
};

const link = (path: string) => {
	if (/^https?:\/\//i.test(path)) return path;
	return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
};

export const replaceCampaignVariables = (
	content: string,
	user: CampaignUser,
	preorder?: CampaignPreorder
) => {
	const firstName = user.firstName?.trim() || "toi";
	const lastName = user.lastName?.trim() || "";
	const endDate = formatDate(preorder?.endDate);
	return content
		.replace(/\{\{\s*prenom\s*\}\}/gi, firstName)
		.replace(/\{\{\s*nom\s*\}\}/gi, lastName)
		.replace(/\{\{\s*date_fin_precommande\s*\}\}/gi, endDate);
};

export const buildCampaignEmail = (params: {
	subject: string;
	message: string;
	ctaLabel?: string;
	ctaUrl?: string;
	user: CampaignUser;
	preorder?: CampaignPreorder;
}) => {
	const subject = replaceCampaignVariables(params.subject, params.user, params.preorder).trim();
	const message = replaceCampaignVariables(params.message, params.user, params.preorder).trim();
	const safeMessage = escapeHtml(message).replace(/\n/g, "<br />");
	const ctaLabel = params.ctaLabel?.trim();
	const ctaUrl = params.ctaUrl?.trim();
	const safeCta =
		ctaLabel && ctaUrl
			? `<p style="margin-top:22px;"><a href="${escapeHtml(link(ctaUrl))}" style="display:inline-block;padding:11px 17px;background:#101820;color:#fff;border-radius:999px;text-decoration:none;font-weight:700;">${escapeHtml(
					replaceCampaignVariables(ctaLabel, params.user, params.preorder)
				)}</a></p>`
			: "";

	return {
		subject,
		html: `
			<div style="font-family: Arial, sans-serif; color:#111827; line-height:1.6;">
				<p>${safeMessage}</p>
				${safeCta}
			</div>
		`,
		text: `${message}${ctaLabel && ctaUrl ? `\n\n${replaceCampaignVariables(ctaLabel, params.user, params.preorder)}: ${link(ctaUrl)}` : ""}`
	};
};

export const getNoOrderReminderEmail = (params: {
	firstName?: string;
	lastName?: string;
	preorderName?: string;
	endDate?: string;
}) =>
	buildCampaignEmail({
		subject: "La vague va partir sans toi",
		message:
			"Salut {{prenom}}, petite relance avant fermeture : la vague de precommande ferme bientot. Si tu veux securiser ton stock, c'est le bon moment. Apres, la commande part fournisseur et on ne pourra plus ajouter de cartons a cette vague.",
		ctaLabel: "Commander avant fermeture",
		ctaUrl: "/precommande",
		user: {
			firstName: params.firstName,
			lastName: params.lastName
		},
		preorder: {
			name: params.preorderName,
			endDate: params.endDate
		}
	});
