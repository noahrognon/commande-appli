import type { SupabaseClient } from "@supabase/supabase-js";

export const createNotification = async (
	client: SupabaseClient,
	params: {
		userId: string;
		type: string;
		title: string;
		message: string;
		link?: string | null;
	},
) => {
	try {
		await client.from("notifications").insert({
			user_id: params.userId,
			type: params.type,
			title: params.title,
			message: params.message,
			link: params.link || null,
			is_read: false
		});
	} catch (error) {
		console.error("Notification insert failed", error);
	}
};
