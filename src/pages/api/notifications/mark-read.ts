import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = SUPABASE_SERVICE_ROLE_KEY
	? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
	: null;

export const prerender = false;

const getToken = (request: Request) => {
	const authHeader = request.headers.get("authorization") || "";
	const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
	if (bearerToken) return bearerToken;
	const cookieHeader = request.headers.get("cookie") || "";
	const cookies = Object.fromEntries(
		cookieHeader
			.split(";")
			.map((c) => c.trim().split("="))
			.filter((parts) => parts.length === 2)
			.map(([k, v]) => [k, decodeURIComponent(v)]),
	);
	return typeof cookies["sb-access-token"] === "string" ? cookies["sb-access-token"] : "";
};

export const POST: APIRoute = async ({ request }) => {
	try {
		if (!adminClient) {
			return new Response(JSON.stringify({ success: false, error: "SUPABASE_SERVICE_ROLE_KEY manquant." }), { status: 500 });
		}

		const token = getToken(request);
		if (!token) {
			return new Response(JSON.stringify({ success: false, error: "Non authentifie." }), { status: 401 });
		}

		const { data: userData, error: userError } = await adminClient.auth.getUser(token);
		if (userError || !userData?.user) {
			return new Response(JSON.stringify({ success: false, error: "Session invalide." }), { status: 401 });
		}

		const body = (await request.json()) as { notificationId?: string; markAll?: boolean };
		if (body.markAll) {
			const { error } = await adminClient
				.from("notifications")
				.update({ is_read: true })
				.eq("user_id", userData.user.id)
				.eq("is_read", false);
			if (error) {
				return new Response(JSON.stringify({ success: false, error: error.message }), { status: 400 });
			}
			return new Response(JSON.stringify({ success: true }), { status: 200 });
		}

		const notificationId = String(body.notificationId || "");
		if (!notificationId) {
			return new Response(JSON.stringify({ success: false, error: "Notification manquante." }), { status: 400 });
		}

		const { error } = await adminClient
			.from("notifications")
			.update({ is_read: true })
			.eq("id", notificationId)
			.eq("user_id", userData.user.id);

		if (error) {
			return new Response(JSON.stringify({ success: false, error: error.message }), { status: 400 });
		}

		return new Response(JSON.stringify({ success: true }), { status: 200 });
	} catch (error: any) {
		return new Response(JSON.stringify({ success: false, error: error?.message || "Erreur serveur" }), { status: 500 });
	}
};
