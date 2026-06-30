import type { APIRoute } from "astro";
import { createServerClient } from "../../../lib/supabaseServer";

const json = (body: Record<string, unknown>, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" }
	});

export const POST: APIRoute = async ({ request, cookies, url }) => {
	const body = await request.json().catch(() => null);
	const accessToken = String(body?.access_token || "");
	const refreshToken = String(body?.refresh_token || "");
	if (!accessToken || !refreshToken) return json({ success: false, error: "Session manquante." }, 400);

	const supabase = createServerClient();
	const { data, error } = await supabase.auth.getUser(accessToken);
	if (error || !data?.user) return json({ success: false, error: "Session invalide." }, 401);

	const isSecure = url.protocol === "https:";
	cookies.set("sb-access-token", accessToken, { path: "/", httpOnly: true, sameSite: "lax", secure: isSecure });
	cookies.set("sb-refresh-token", refreshToken, { path: "/", httpOnly: true, sameSite: "lax", secure: isSecure });

	return json({ success: true });
};
