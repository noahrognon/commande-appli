import { createServerClient } from "./supabaseServer";
import { getAdminFromRequest } from "./adminAuth";

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

export const requireAdminRequest = async (request: Request) => {
	const admin = await getAdminFromRequest(request);
	if (admin) return admin;

	const token = getTokenFromRequest(request);
	if (!token) return null;

	const supabase = createServerClient();
	const { data, error } = await supabase.auth.getUser(token);
	if (error || !data?.user) return null;
	const user = data.user as any;
	const role =
		user.role ||
		user.user_metadata?.role ||
		user.app_metadata?.role ||
		user.user_metadata?.user_role;
	if (role === "admin") {
		return { id: user.id, email: user.email || "" };
	}
	return null;
};
