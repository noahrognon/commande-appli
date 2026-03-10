import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "../../../server/lib/email.js";
import { getOrderConfirmationEmail } from "../../lib/emailTemplates";
import { createNotification } from "../../lib/notifications";
import { computeOrderPricing } from "../../lib/orderPricing";
import type { PromoCodeRow } from "../../lib/promoCodes";
import { validatePromoCode } from "../../lib/promoCodes";

const SUPABASE_URL = import.meta.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = SUPABASE_SERVICE_ROLE_KEY
	? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
	: null;

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	try {
		if (!adminClient) {
			return new Response(JSON.stringify({ success: false, error: "SUPABASE_SERVICE_ROLE_KEY manquant." }), { status: 500 });
		}
		const authHeader = request.headers.get("authorization") || "";
		const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
		const cookieHeader = request.headers.get("cookie") || "";
		const cookies = Object.fromEntries(
			cookieHeader
				.split(";")
				.map((c) => c.trim().split("="))
				.filter((parts) => parts.length === 2)
				.map(([k, v]) => [k, decodeURIComponent(v)])
		);
		const cookieToken = typeof cookies["sb-access-token"] === "string" ? cookies["sb-access-token"] : "";
		const token = bearerToken || cookieToken;

		if (!token) {
			return new Response(JSON.stringify({ success: false, error: "Non authentifie." }), { status: 401 });
		}

		const { data: userData, error: userError } = await adminClient.auth.getUser(token);
		if (userError || !userData?.user) {
			return new Response(JSON.stringify({ success: false, error: "Session invalide." }), { status: 401 });
		}
		const user = userData.user;


		const body = await request.json();
		const cartons = Number(body.cartons || 0);
		const payment_method = body.payment_method as string;
		const preorder_id = body.preorder_id as string;
		const flavors = Array.isArray(body.flavors) ? body.flavors : [];
		const promo_code = String(body.promo_code || "");
		const requestedOrderNumber = body.order_number as string;
		const order_number =
			requestedOrderNumber ||
			`CMD-${new Date().getFullYear()}-${Math.floor(Math.random() * 900 + 100)}`;

		if (!preorder_id) {
			return new Response(JSON.stringify({ success: false, error: "Precommande manquante." }), { status: 400 });
		}
		if (!payment_method) {
			return new Response(JSON.stringify({ success: false, error: "Mode de paiement obligatoire." }), { status: 400 });
		}
		if (cartons < 1) {
			return new Response(JSON.stringify({ success: false, error: "Au moins 1 carton requis." }), { status: 400 });
		}

		const { data: preorder, error: preorderError } = await adminClient
			.from("preorders")
			.select("id, end_date, status")
			.eq("status", "open")
			.eq("id", preorder_id)
			.single();

		if (preorderError || !preorder) {
			return new Response(JSON.stringify({ success: false, error: "Aucune precommande ouverte." }), { status: 400 });
		}

		let promo: PromoCodeRow | null = null;
		if (promo_code) {
			const promoResult = await validatePromoCode({
				client: adminClient,
				code: promo_code,
				cartons
			});
			if (!promoResult.ok) {
				return new Response(JSON.stringify({ success: false, error: promoResult.error }), { status: 400 });
			}
			promo = promoResult.promo;
		}

		const pricing = computeOrderPricing({
			cartons,
			promo
		});
		const total = pricing.total;

		const flavorRows = flavors
			.filter((f: any) => f?.flavor_id && Number(f?.quantity) > 0)
			.map((f: any) => ({
				flavor_id: f.flavor_id,
				quantity: Number(f.quantity)
			}));

		const totalFlavorCount = flavorRows.reduce((sum, f) => sum + Number(f.quantity || 0), 0);
		if (flavorRows.length === 0) {
			return new Response(JSON.stringify({ success: false, error: "Aucun gout selectionne." }), { status: 400 });
		}
		if (totalFlavorCount > 10) {
			return new Response(JSON.stringify({ success: false, error: "Maximum 10 gouts selectionnes." }), { status: 400 });
		}

		const addDays = (dateStr: string, days: number) => {
			const d = new Date(dateStr);
			d.setUTCDate(d.getUTCDate() + days);
			return d.toISOString();
		};

		const estimated_delivery_start = addDays(preorder.end_date, 14);
		const estimated_delivery_end = addDays(preorder.end_date, 17);

		const { data: orderInsert, error: orderError } = await adminClient
			.from("orders")
			.insert({
				user_id: user.id,
				preorder_id,
				cartons,
				total,
				payment_method,
				status: "pending",
				estimated_delivery_start,
				estimated_delivery_end,
				order_number,
				promo_code_id: promo?.id || null,
				promo_code: promo?.code || null,
				promo_discount_amount: pricing.promoDiscountAmount
			})
			.select("id")
			.single();

		if (orderError || !orderInsert?.id) {
			return new Response(JSON.stringify({ success: false, error: orderError?.message || "Creation commande impossible." }), { status: 400 });
		}

		const order_id = orderInsert.id;
		const orderFlavorRows = flavorRows.map((row) => ({
			order_id,
			flavor_id: row.flavor_id,
			quantity: row.quantity
		}));

		const { error: flavorsInsertError } = await adminClient.from("order_flavors").insert(orderFlavorRows);
		if (flavorsInsertError) {
			await adminClient.from("orders").delete().eq("id", order_id);
			return new Response(JSON.stringify({ success: false, error: flavorsInsertError.message }), { status: 400 });
		}

		if (promo?.id) {
			const { error: promoUsageError } = await adminClient
				.from("promo_code_usages")
				.insert({
					promo_code_id: promo.id,
					user_id: user.id,
					order_id,
					discount_amount: pricing.promoDiscountAmount
				});

			if (promoUsageError) {
				await adminClient.from("order_flavors").delete().eq("order_id", order_id);
				await adminClient.from("orders").delete().eq("id", order_id);
				return new Response(JSON.stringify({ success: false, error: promoUsageError.message }), { status: 400 });
			}
		}

		await createNotification(adminClient, {
			userId: user.id,
			type: "order_created",
			title: "Commande enregistree",
			message: `Ta commande ${order_number} a bien ete creee pour ${cartons} carton(s).`,
			link: "/profile"
		});

		const firstName =
			(typeof user.user_metadata?.first_name === "string" && user.user_metadata.first_name) ||
			(typeof user.user_metadata?.firstName === "string" && user.user_metadata.firstName) ||
			"";

		if (user.email) {
			try {
				const emailContent = getOrderConfirmationEmail({
					firstName,
					orderNumber: order_number || `CMD-${order_id}`,
					cartons,
					total,
					estimatedStart: estimated_delivery_start,
					estimatedEnd: estimated_delivery_end,
					paymentMethod: payment_method
				});
				await sendEmail({
					to: user.email,
					subject: emailContent.subject,
					html: emailContent.html,
					text: emailContent.text
				});

				const { error: logError } = await adminClient.from("email_logs").insert({
					type: `order_confirmation_${order_id}`,
					user_id: user.id,
					preorder_id,
					order_id
				});
				if (logError) {
					console.error("Email log insert failed", logError);
				}
			} catch (mailError) {
				console.error("Email confirmation failed", mailError);
			}
		}

		return new Response(JSON.stringify({ success: true }), { status: 200 });
	} catch (e: any) {
		return new Response(JSON.stringify({ success: false, error: e?.message || "Erreur serveur" }), { status: 500 });
	}
};
