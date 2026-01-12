import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.SUPABASE_ANON_KEY as string;

export const createServerClient = () =>
	createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
		auth: {
			persistSession: false,
			autoRefreshToken: false
		}
	});

export const getUserFromCookies = async (cookies: { get: (name: string) => { value?: string } | undefined }) => {
	const token = cookies.get("sb-access-token")?.value || "";
	if (!token) return null;
	const supabase = createServerClient();
	const { data, error } = await supabase.auth.getUser(token);
	if (error) return null;
	return data?.user ?? null;
};
