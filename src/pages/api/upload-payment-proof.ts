import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

const BUCKET = "payment-proofs";
const MAX_FILE_SIZE = 6 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const json = (body: Record<string, unknown>, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" }
	});

const getTokenFromRequest = (request: Request) => {
	const authHeader = request.headers.get("authorization") || "";
	const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
	if (bearerToken) return bearerToken;

	const cookieHeader = request.headers.get("cookie") || "";
	const cookies = Object.fromEntries(
		cookieHeader
			.split(";")
			.map((c) => c.trim().split("="))
			.filter((parts) => parts.length === 2)
			.map(([k, v]) => [k, decodeURIComponent(v)])
	);
	return typeof cookies["sb-access-token"] === "string" ? cookies["sb-access-token"] : "";
};

const extensionForType = (type: string) => {
	if (type === "image/png") return "png";
	if (type === "image/webp") return "webp";
	return "jpg";
};

const ensureBucket = async () => {
	if (!supabaseAdmin) return;
	const { data } = await supabaseAdmin.storage.getBucket(BUCKET);
	if (data) return;
	await supabaseAdmin.storage.createBucket(BUCKET, {
		public: false,
		fileSizeLimit: MAX_FILE_SIZE,
		allowedMimeTypes: Array.from(ALLOWED_TYPES)
	});
};

export const POST: APIRoute = async ({ request }) => {
	if (!supabaseAdmin) return json({ success: false, error: "Configuration Supabase manquante." }, 500);

	const token = getTokenFromRequest(request);
	if (!token) return json({ success: false, error: "Non authentifié." }, 401);

	const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
	if (userError || !userData?.user) return json({ success: false, error: "Session invalide." }, 401);

	const formData = await request.formData().catch(() => null);
	const file = formData?.get("proof");
	if (!(file instanceof File)) return json({ success: false, error: "Preuve de paiement manquante." }, 400);
	if (!ALLOWED_TYPES.has(file.type)) {
		return json({ success: false, error: "Format invalide. Utilise JPG, PNG ou WEBP." }, 400);
	}
	if (file.size > MAX_FILE_SIZE) {
		return json({ success: false, error: "Fichier trop lourd. Maximum 6 Mo." }, 400);
	}

	await ensureBucket();

	const ext = extensionForType(file.type);
	const safeName = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
	const path = `${userData.user.id}/${safeName}`;
	const buffer = Buffer.from(await file.arrayBuffer());

	const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, {
		contentType: file.type,
		upsert: false
	});

	if (uploadError) return json({ success: false, error: uploadError.message }, 400);
	return json({ success: true, path });
};
