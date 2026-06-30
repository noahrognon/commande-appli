const siteUrl = (import.meta.env.PUBLIC_SITE_URL || "https://commande.noahrognon.fr")
	.toString()
	.replace(/\/$/, "");

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

const link = (path: string) => {
	if (/^https?:\/\//i.test(path)) return path;
	return siteUrl ? `${siteUrl}${path}` : path;
};

const money = (value: number) => `${Math.round(value)} EUR`;

const renderFlavorList = (flavors?: { name: string; quantity: number }[]) => {
	if (!flavors?.length) return "";
	return `
		<li>Gouts selectionnes:
			<ul>
				${flavors
					.map(
						(flavor) =>
							`<li><strong>${flavor.quantity}</strong> x ${flavor.name || "Gout selectionne"}</li>`
					)
					.join("")}
			</ul>
		</li>
	`;
};

const textFlavorList = (flavors?: { name: string; quantity: number }[]) => {
	if (!flavors?.length) return "";
	return ` Gouts: ${flavors.map((flavor) => `${flavor.quantity} x ${flavor.name || "Gout"}`).join(", ")}.`;
};

export const getOrderConfirmationEmail = (params: {
	firstName?: string;
	orderNumber: string;
	cartons: number;
	total: number;
	estimatedStart?: string;
	estimatedEnd?: string;
	paymentMethod?: string;
	paymentProofReceived?: boolean;
	flavors?: { name: string; quantity: number }[];
	nextStep?: string;
}) => {
	const name = formatName(params.firstName);
	const payment = params.paymentMethod === "virement" ? "virement bancaire" : "paiement liquide";
	const proof =
		params.paymentMethod === "virement"
			? params.paymentProofReceived
				? "preuve de virement recue"
				: "preuve de virement en attente"
			: "non necessaire";
	const nextStep =
		params.nextStep ||
		(params.paymentMethod === "virement"
			? "Nous allons verifier la preuve de paiement puis valider la commande."
			: "La commande sera validee apres confirmation du paiement.");
	const subject = `Confirmation de commande ${params.orderNumber}`;
	const html = `
		<div style="font-family: Arial, sans-serif; color:#111827;">
			<h2>Merci ${name}</h2>
			<p>Votre commande est bien enregistree. Voici le recapitulatif.</p>
			<ul>
				<li>Numero: <strong>${params.orderNumber}</strong></li>
				<li>Cartons: <strong>${params.cartons}</strong></li>
				<li>Total: <strong>${money(params.total)}</strong></li>
				<li>Paiement: <strong>${payment}</strong></li>
				<li>Preuve de paiement: <strong>${proof}</strong></li>
				${renderFlavorList(params.flavors)}
				<li>Livraison estimee: <strong>${formatDate(params.estimatedStart)} - ${formatDate(
		params.estimatedEnd
	)}</strong></li>
			</ul>
			<p><strong>Prochaine etape:</strong> ${nextStep}</p>
			<p>
				<a href="${link("/profile")}" style="display:inline-block;padding:10px 16px;background:#4f6fff;color:#fff;border-radius:8px;text-decoration:none;">
					Voir ma commande
				</a>
			</p>
		</div>
	`;
	const text = `Merci ${name}. Commande ${params.orderNumber}. Cartons ${params.cartons}. Total ${Math.round(
		params.total
	)} EUR. Paiement ${payment}. Preuve: ${proof}.${textFlavorList(params.flavors)} Prochaine etape: ${nextStep}. Livraison estimee ${formatDate(params.estimatedStart)} - ${formatDate(
		params.estimatedEnd
	)}.`;
	return { subject, html, text };
};

export const getPaymentPendingEmail = (params: {
	firstName?: string;
	orderNumber: string;
	total: number;
	paymentMethod?: string;
}) => {
	const name = formatName(params.firstName);
	const payment = params.paymentMethod === "virement" ? "virement bancaire" : "paiement liquide";
	const action =
		params.paymentMethod === "virement"
			? "La preuve de paiement doit etre presente et valide pour que la commande soit confirmee."
			: "Le paiement liquide doit etre confirme pour que la commande soit validee.";
	const subject = `Paiement en attente - ${params.orderNumber}`;
	const html = `
		<div style="font-family: Arial, sans-serif; color:#111827;">
			<h2>Bonjour ${name}</h2>
			<p>Votre commande <strong>${params.orderNumber}</strong> est bien creee, mais le paiement est encore en attente.</p>
			<ul>
				<li>Total: <strong>${money(params.total)}</strong></li>
				<li>Methode: <strong>${payment}</strong></li>
			</ul>
			<p>${action}</p>
			<p>
				<a href="${link("/profile")}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;border-radius:8px;text-decoration:none;">
					Voir ma commande
				</a>
			</p>
		</div>
	`;
	const text = `Bonjour ${name}. Paiement en attente pour la commande ${params.orderNumber}. Total ${money(
		params.total
	)}. Methode: ${payment}. ${action}`;
	return { subject, html, text };
};

export const getPaymentValidatedEmail = (params: { firstName?: string; orderNumber: string }) => {
	const name = formatName(params.firstName);
	const subject = `Paiement valide - ${params.orderNumber}`;
	const html = `
		<div style="font-family: Arial, sans-serif; color:#111827;">
			<h2>Bonjour ${name}</h2>
			<p>Le paiement de votre commande <strong>${params.orderNumber}</strong> est valide.</p>
			<p>Votre commande est confirmee et partira dans la vague fournisseur.</p>
			<p>
				<a href="${link("/profile")}" style="display:inline-block;padding:10px 16px;background:#4f6fff;color:#fff;border-radius:8px;text-decoration:none;">
					Suivre ma commande
				</a>
			</p>
		</div>
	`;
	const text = `Bonjour ${name}. Paiement valide pour la commande ${params.orderNumber}. Votre commande partira dans la vague fournisseur.`;
	return { subject, html, text };
};

export const getPaymentProofRejectedEmail = (params: {
	firstName?: string;
	orderNumber: string;
	reason?: string;
}) => {
	const name = formatName(params.firstName);
	const reason = params.reason?.trim();
	const reasonText = reason || "La preuve envoyee ne permet pas de valider le paiement.";
	const subject = `Preuve de paiement a renvoyer - ${params.orderNumber}`;
	const html = `
		<div style="font-family: Arial, sans-serif; color:#111827;">
			<h2>Bonjour ${name}</h2>
			<p>La preuve de paiement de votre commande <strong>${params.orderNumber}</strong> n'a pas pu etre validee.</p>
			<p><strong>Raison:</strong> ${reasonText}</p>
			<p>Merci de renvoyer une preuve lisible avec le bon montant et la bonne reference de commande.</p>
			<p>
				<a href="${link("/profile")}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;border-radius:8px;text-decoration:none;">
					Voir ma commande
				</a>
			</p>
		</div>
	`;
	const text = `Bonjour ${name}. La preuve de paiement de la commande ${params.orderNumber} n'a pas pu etre validee. Raison: ${reasonText}. Merci de renvoyer une preuve lisible avec le bon montant.`;
	return { subject, html, text };
};

export const getAdminNewOrderEmail = (params: {
	orderNumber: string;
	clientName?: string;
	clientEmail?: string;
	cartons: number;
	total: number;
	paymentMethod?: string;
	paymentProofReceived?: boolean;
	flavors?: { name: string; quantity: number }[];
}) => {
	const payment = params.paymentMethod === "virement" ? "virement bancaire" : "paiement liquide";
	const proof =
		params.paymentMethod === "virement"
			? params.paymentProofReceived
				? "preuve recue"
				: "preuve manquante"
			: "non necessaire";
	const subject = `Nouvelle commande ${params.orderNumber}`;
	const html = `
		<div style="font-family: Arial, sans-serif; color:#111827;">
			<h2>Nouvelle commande</h2>
			<ul>
				<li>Numero: <strong>${params.orderNumber}</strong></li>
				<li>Client: <strong>${params.clientName || "Client"}</strong></li>
				<li>Email: <strong>${params.clientEmail || "non renseigne"}</strong></li>
				<li>Cartons: <strong>${params.cartons}</strong></li>
				<li>Total: <strong>${money(params.total)}</strong></li>
				<li>Paiement: <strong>${payment}</strong></li>
				<li>Preuve: <strong>${proof}</strong></li>
				${renderFlavorList(params.flavors)}
			</ul>
			<p>
				<a href="${link("/admin")}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;border-radius:8px;text-decoration:none;">
					Ouvrir l'admin
				</a>
			</p>
		</div>
	`;
	const text = `Nouvelle commande ${params.orderNumber}. Client: ${params.clientName || "Client"} <${
		params.clientEmail || "non renseigne"
	}>. Cartons ${params.cartons}. Total ${money(params.total)}. Paiement ${payment}. Preuve: ${proof}.${textFlavorList(params.flavors)}`;
	return { subject, html, text };
};

export const getPreorderReminderEmail = (params: {
	firstName?: string;
	daysLeft?: number;
	hoursLeft?: number;
	preorderName: string;
	endDate: string;
}) => {
	const name = formatName(params.firstName);
	const remaining =
		typeof params.hoursLeft === "number"
			? `dans moins de ${params.hoursLeft}h`
			: `dans ${params.daysLeft ?? 1} jour(s)`;
	const subject =
		typeof params.hoursLeft === "number"
			? "Dernieres 24h pour la precommande"
			: `Rappel precommande: J-${params.daysLeft}`;
	const html = `
		<div style="font-family: Arial, sans-serif; color:#111827;">
			<h2>Bonjour ${name}</h2>
			<p>La precommande <strong>${params.preorderName}</strong> se termine ${remaining}.</p>
			<p>Date de fin: <strong>${formatDate(params.endDate)}</strong></p>
			<p>
				<a href="${link("/precommande")}" style="display:inline-block;padding:10px 16px;background:#7a4bff;color:#fff;border-radius:8px;text-decoration:none;">
					Commander maintenant
				</a>
			</p>
		</div>
	`;
	const text = `Bonjour ${name}. La precommande ${params.preorderName} se termine ${remaining}. Fin: ${formatDate(
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

export const getPreorderOpenAnnouncementEmail = (params: {
	firstName?: string;
	preorderName: string;
	endDate?: string;
}) => {
	const name = formatName(params.firstName);
	const subject = `Precommande ouverte: ${params.preorderName}`;
	const html = `
		<div style="font-family: Arial, sans-serif; color:#111827;">
			<h2>Bonjour ${name}</h2>
			<p>La nouvelle precommande <strong>${params.preorderName}</strong> est maintenant ouverte.</p>
			<p>Tu peux deja commander tes cartons et choisir tes gouts avant la cloture du ${formatDate(
		params.endDate
	)}. La prochaine commande sera prevu debut juillet.</p>
			<p>
				<a href="${link("https://commande.noahrognon.fr/precommande")}" style="display:inline-block;padding:10px 16px;background:#7a4bff;color:#fff;border-radius:8px;text-decoration:none;">
					Lancer ma precommande
				</a>
			</p>
			<p style="font-size:12px;color:#64748b;">Passe par ton espace pour voir le timer, ton historique et le catalogue complet.</p>
		</div>
	`;
	const text = `Bonjour ${name}. La precommande ${params.preorderName} est ouverte jusqu'au ${formatDate(
		params.endDate
	)}. Rendez-vous sur /precommande pour commander.`;
	return { subject, html, text };
};
