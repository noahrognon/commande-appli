import type { SupabaseClient } from "@supabase/supabase-js";

export type UserInfo = {
	id: string;
	email: string;
	firstName: string;
	lastName: string;
};

export const fetchUsersMap = async (client: SupabaseClient) => {
	const map = new Map<string, UserInfo>();
	let page = 1;
	const perPage = 1000;

	while (true) {
		const { data, error } = await client.auth.admin.listUsers({ page, perPage });
		if (error || !data?.users) break;
		for (const user of data.users) {
			map.set(user.id, {
				id: user.id,
				email: user.email || "",
				firstName: (user.user_metadata?.first_name as string) || "",
				lastName: (user.user_metadata?.last_name as string) || ""
			});
		}
		if (data.users.length < perPage) break;
		page += 1;
	}

	return map;
};
