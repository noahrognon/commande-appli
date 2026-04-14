import type { APIRoute } from "astro";
import { requireAdminRequest } from "../../../lib/adminGuard";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { fetchUsersMap } from "../../../lib/userLookup";

const escapeCsv = (value: unknown) => {
	const stringValue = String(value ?? "");
	return `"${stringValue.replace(/"/g, '""')}"`;
};

export const GET: APIRoute = async ({ request }) => {
	if (!supabaseAdmin) {
		return new Response("Missing admin client.", { status: 500 });
	}

	const admin = await requireAdminRequest(request);
	if (!admin) {
		return new Response("Forbidden", { status: 403 });
	}

	const { data: ordersData, error: ordersError } = await supabaseAdmin
		.from("orders")
		.select(
			"id, order_number, user_id, preorder_id, cartons, total, payment_method, status, created_at"
		)
		.order("created_at", { ascending: false });

	if (ordersError) {
		return new Response(ordersError.message, { status: 400 });
	}

	const orders = ordersData ?? [];
	const orderIds = orders.map((order) => order.id);
	const preorderIds = [...new Set(orders.map((order) => order.preorder_id).filter(Boolean))];

	const [{ data: orderFlavors }, { data: flavors }, { data: preorders }] = await Promise.all([
		orderIds.length > 0
			? supabaseAdmin
				.from("order_flavors")
				.select("order_id, flavor_id, quantity")
				.in("order_id", orderIds)
			: Promise.resolve({ data: [] as any[] }),
		supabaseAdmin.from("flavors").select("id, name"),
		preorderIds.length > 0
			? supabaseAdmin.from("preorders").select("id, name").in("id", preorderIds)
			: Promise.resolve({ data: [] as any[] })
	]);

	const usersMap = await fetchUsersMap(supabaseAdmin);
	const flavorMap = new Map((flavors ?? []).map((flavor) => [flavor.id, flavor.name]));
	const preorderMap = new Map((preorders ?? []).map((preorder) => [preorder.id, preorder.name]));

	const flavorsByOrder = new Map<string, string[]>();
	for (const item of orderFlavors ?? []) {
		const current = flavorsByOrder.get(item.order_id) ?? [];
		const flavorName = flavorMap.get(item.flavor_id) ?? "Inconnu";
		current.push(`${flavorName} x${Number(item.quantity ?? 0)}`);
		flavorsByOrder.set(item.order_id, current);
	}

	const rows = [
		[
			"numero_commande",
			"date_commande",
			"prenom",
			"nom",
			"email",
			"precommande",
			"cartons",
			"total_eur",
			"mode_paiement",
			"statut",
			"gouts"
		],
		...orders.map((order) => {
			const user = usersMap.get(order.user_id);
			return [
				order.order_number,
				order.created_at,
				user?.firstName || "",
				user?.lastName || "",
				user?.email || "",
				preorderMap.get(order.preorder_id) || "",
				Number(order.cartons ?? 0),
				Number(order.total ?? 0),
				order.payment_method || "",
				order.status || "",
				(flavorsByOrder.get(order.id) ?? []).join(" | ")
			];
		})
	];

	const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
	const filename = `commandes-${new Date().toISOString().slice(0, 10)}.csv`;

	return new Response(csv, {
		status: 200,
		headers: {
			"content-type": "text/csv; charset=utf-8",
			"content-disposition": `attachment; filename="${filename}"`
		}
	});
};
