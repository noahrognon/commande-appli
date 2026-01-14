const siteUrl = (import.meta.env.PUBLIC_SITE_URL || "").toString().replace(/\/$/, "");

const formatDate = (value?: string) => {
	if (!value) return "N/A";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	const day = String(date.getDate()).padStart(2, "0");
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const year = date.getFullYear();
	return `${day}/${month}/${year}`;
};

const formatName = (name?: string) => (name && name.trim().length > 0 ? name.trim() : "client");

const link = (path: string) => (siteUrl ? `${siteUrl}${path}` : path);

export const getOrderConfirmationEmail = (params: {
	firstName?: string;
	orderNumber: string;
	cartons: number;
	total: number;
	estimatedStart?: string;
	estimatedEnd?: string;
	paymentMethod?: string;
}) => {
	const name = formatName(params.firstName);
	const payment = params.paymentMethod === "virement" ? "virement bancaire" : "paiement liquide";
	const subject = `Confirmation de commande ${params.orderNumber}`;
	const html = `
		<div style="font-family: Arial, sans-serif; color:#111827;">
			<h2>Merci ${name}</h2>
			<p>Votre commande est bien enregistree.</p>
			<ul>
				<li>Numero: <strong>${params.orderNumber}</strong></li>
				<li>Cartons: <strong>${params.cartons}</strong></li>
				<li>Total: <strong>${Math.round(params.total)} EUR</strong></li>
				<li>Paiement: <strong>${payment}</strong></li>
				<li>Livraison estimee: <strong>${formatDate(params.estimatedStart)} - ${formatDate(
					params.estimatedEnd
				)}</strong></li>
			</ul>
			<p>
				<a href="${link("/dashboard")}" style="display:inline-block;padding:10px 16px;background:#4f6fff;color:#fff;border-radius:8px;text-decoration:none;">
					Voir ma commande
				</a>
			</p>
		</div>
	`;
	const text = `Merci ${name}. Commande ${params.orderNumber}. Cartons ${params.cartons}. Total ${Math.round(
		params.total
	)} EUR. Paiement ${payment}. Livraison estimee ${formatDate(params.estimatedStart)} - ${formatDate(
		params.estimatedEnd
	)}.`;
	return { subject, html, text };
};

export const getPreorderReminderEmail = (params: {
	firstName?: string;
	daysLeft: number;
	preorderName: string;
	endDate: string;
}) => {
	const name = formatName(params.firstName);
	const subject = `Rappel precommande: J-${params.daysLeft}`;
	const html = `
		<div style="font-family: Arial, sans-serif; color:#111827;">
			<h2>Bonjour ${name}</h2>
			<p>La precommande <strong>${params.preorderName}</strong> se termine dans ${params.daysLeft} jour(s).</p>
			<p>Date de fin: <strong>${formatDate(params.endDate)}</strong></p>
			<p>
				<a href="${link("/precommande")}" style="display:inline-block;padding:10px 16px;background:#7a4bff;color:#fff;border-radius:8px;text-decoration:none;">
					Commander maintenant
				</a>
			</p>
		</div>
	`;
	const text = `Bonjour ${name}. La precommande ${params.preorderName} se termine dans ${params.daysLeft} jour(s). Fin: ${formatDate(
		params.endDate
	)}.`;
	return { subject, html, text };
};

export const getSupplierOrderSentEmail = (params: {
	firstName?: string;
	preorderName: string;
	etaInDays?: number;
}) => {
	const name = formatName(params.firstName);
	const eta = params.etaInDays ?? 14;
	const subject = "Commande fournisseur envoyee";
	const html = `
		<div style="font-family: Arial, sans-serif; color:#111827;">
			<h2>Bonjour ${name}</h2>
			<p>La commande fournisseur pour <strong>${params.preorderName}</strong> a ete envoyee.</p>
			<p>Livraison estimee dans environ ${eta} jours.</p>
			<p>
				<a href="${link("/dashboard")}" style="display:inline-block;padding:10px 16px;background:#4f6fff;color:#fff;border-radius:8px;text-decoration:none;">
					Suivre ma commande
				</a>
			</p>
		</div>
	`;
	const text = `Bonjour ${name}. La commande fournisseur pour ${params.preorderName} a ete envoyee. Livraison estimee dans ${eta} jours.`;
	return { subject, html, text };
};

export const getStockReceivedEmail = (params: { firstName?: string; preorderName: string }) => {
	const name = formatName(params.firstName);
	const subject = "Stock recu / pret a livrer";
	const html = `
		<div style="font-family: Arial, sans-serif; color:#111827;">
			<h2>Bonjour ${name}</h2>
			<p>Le stock de la precommande <strong>${params.preorderName}</strong> est arrive.</p>
			<p>Nous allons organiser les remises tres bientot.</p>
			<p>
				<a href="${link("/dashboard")}" style="display:inline-block;padding:10px 16px;background:#7a4bff;color:#fff;border-radius:8px;text-decoration:none;">
					Voir mes commandes
				</a>
			</p>
		</div>
	`;
	const text = `Bonjour ${name}. Stock recu pour ${params.preorderName}. Nous organisons les remises tres bientot.`;
	return { subject, html, text };
};
