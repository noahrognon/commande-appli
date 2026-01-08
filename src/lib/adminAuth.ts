import crypto from "node:crypto";
import type { AstroGlobal } from "astro";
import { supabaseAdmin } from "./supabaseAdmin";

const COOKIE_NAME = "admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const ADMIN_SESSION_SECRET = (import.meta.env.ADMIN_SESSION_SECRET ||
	import.meta.env.SUPABASE_SERVICE_ROLE_KEY ||
	"") as string;

type AdminSession = {
	id: string;
	email: string;
	exp: number;
};

const encode = (value: string) => Buffer.from(value).toString("base64url");
const decode = (value: string) => Buffer.from(value, "base64url").toString("utf8");

const sign = (payload: string) =>
	crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(payload).digest("base64url");

const readCookie = (header: string | null, name: string) => {
	if (!header) return null;
	const parts = header.split(";").map((part) => part.trim());
	for (const part of parts) {
		if (part.startsWith(`${name}=`)) {
			return part.slice(name.length + 1);
		}
	}
	return null;
};

export const createAdminSessionToken = (admin: { id: string; email: string }) => {
	const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
	const payload = encode(JSON.stringify({ id: admin.id, email: admin.email, exp }));
	const signature = sign(payload);
	return `${payload}.${signature}`;
};

export const verifyAdminSessionToken = (token: string | undefined | null): AdminSession | null => {
	if (!token || !ADMIN_SESSION_SECRET) return null;
	const [payload, signature] = token.split(".");
	if (!payload || !signature) return null;
	const expected = sign(payload);
	const signatureBuffer = Buffer.from(signature);
	const expectedBuffer = Buffer.from(expected);
	if (
		signatureBuffer.length !== expectedBuffer.length ||
		!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
	) {
		return null;
	}
	const data = JSON.parse(decode(payload)) as AdminSession;
	if (!data?.id || !data?.email || !data?.exp) return null;
	if (Math.floor(Date.now() / 1000) > data.exp) return null;
	return data;
};

export const getAdminFromRequest = async (request: Request) => {
	const token = readCookie(request.headers.get("cookie"), COOKIE_NAME);
	const session = verifyAdminSessionToken(token);
	if (!session || !supabaseAdmin) return null;
	const { data, error } = await supabaseAdmin
		.from("admins")
		.select("id, email")
		.eq("id", session.id)
		.eq("email", session.email)
		.maybeSingle();
	if (error || !data) return null;
	return data;
};

export const requireAdmin = async (Astro: AstroGlobal) => {
	const admin = await getAdminFromRequest(Astro.request);
	return admin;
};

export const setAdminSessionCookie = (Astro: AstroGlobal, token: string) => {
	Astro.cookies.set(COOKIE_NAME, token, {
		httpOnly: true,
		secure: import.meta.env.PROD,
		sameSite: "lax",
		path: "/",
		maxAge: SESSION_TTL_SECONDS
	});
};

export const clearAdminSessionCookie = (Astro: AstroGlobal) => {
	Astro.cookies.set(COOKIE_NAME, "", {
		httpOnly: true,
		secure: import.meta.env.PROD,
		sameSite: "lax",
		path: "/",
		maxAge: 0
	});
};
