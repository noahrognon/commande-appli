import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import { sendMail } from "../../lib/mailer";
import { getOrderConfirmationEmail } from "../../lib/emailTemplates";

const SUPABASE_URL = import.meta.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.SUPABASE_ANON_KEY;
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

		// Recalcul server-side
		const subtotal = cartons * 75;
		let discountPct = 0;
		if (cartons >= 10) discountPct = 10;
		else if (cartons >= 5) discountPct = 7;
		else if (cartons >= 3) discountPct = 4;
		const total = Math.round(subtotal * (1 - discountPct / 100));

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
				order_number
			})
			.select("id")
			.single();

		if (orderError || !orderInsert?.id) {
			return new Response(JSON.stringify({ success: false, error: orderError?.message || "Creation commande impossible." }), { status: 400 });
		}

		const order_id = orderInsert.id;
		const flavorRows = flavors
			.filter((f: any) => f?.flavor_id && Number(f?.quantity) > 0)
			.map((f: any) => ({
				order_id,
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

		const { error: flavorsInsertError } = await adminClient.from("order_flavors").insert(flavorRows);
		if (flavorsInsertError) {
			return new Response(JSON.stringify({ success: false, error: flavorsInsertError.message }), { status: 400 });
		}

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
				await sendMail({
					to: user.email,
					subject: emailContent.subject,
					html: emailContent.html,
					text: emailContent.text
				});

				const { error: logError } = await adminClient.from("email_logs").insert({
					type: "order_confirmation",
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
