import type { SupabaseClient } from "@supabase/supabase-js";
import { computeOrderPricing } from "./orderPricing";

export type PromoCodeRow = {
	id: string;
	code: string;
	type: "fixed" | "percent";
	value: number;
	is_active: boolean;
	min_cartons: number | null;
	max_uses: number | null;
	starts_at: string | null;
	ends_at: string | null;
};

export const normalizePromoCode = (code: string) =>
	String(code || "").trim().toUpperCase();

const isPromoCurrentlyValid = (promo: PromoCodeRow, now = new Date()) => {
	if (!promo.is_active) return false;
	if (promo.starts_at && new Date(promo.starts_at) > now) return false;
	if (promo.ends_at && new Date(promo.ends_at) < now) return false;
	return true;
};

export const getPromoCodeByCode = async (
	client: SupabaseClient,
	code: string,
) => {
	const normalizedCode = normalizePromoCode(code);
	if (!normalizedCode) return null;
	const { data, error } = await client
		.from("promo_codes")
		.select(
			"id, code, type, value, is_active, min_cartons, max_uses, starts_at, ends_at",
		)
		.eq("code", normalizedCode)
		.maybeSingle();
	if (error || !data) return null;
	return {
		...data,
		value: Number(data.value || 0),
		min_cartons: data.min_cartons == null ? null : Number(data.min_cartons),
		max_uses: data.max_uses == null ? null : Number(data.max_uses)
	} as PromoCodeRow;
};

export const getPromoCodeById = async (
	client: SupabaseClient,
	id: string,
) => {
	if (!id) return null;
	const { data, error } = await client
		.from("promo_codes")
		.select(
			"id, code, type, value, is_active, min_cartons, max_uses, starts_at, ends_at",
		)
		.eq("id", id)
		.maybeSingle();
	if (error || !data) return null;
	return {
		...data,
		value: Number(data.value || 0),
		min_cartons: data.min_cartons == null ? null : Number(data.min_cartons),
		max_uses: data.max_uses == null ? null : Number(data.max_uses)
	} as PromoCodeRow;
};

export const validatePromoCode = async (params: {
	client: SupabaseClient;
	code: string;
	cartons: number;
}) => {
	const promo = await getPromoCodeByCode(params.client, params.code);
	if (!promo) {
		return { ok: false as const, error: "Code promo introuvable." };
	}
	if (!isPromoCurrentlyValid(promo)) {
		return { ok: false as const, error: "Code promo inactif ou expire." };
	}
	if (params.cartons < Number(promo.min_cartons || 1)) {
		return {
			ok: false as const,
			error: `Ce code promo demande au moins ${promo.min_cartons} carton(s).`
		};
	}

	if (promo.max_uses != null) {
		const { count } = await params.client
			.from("promo_code_usages")
			.select("id", { count: "exact", head: true })
			.eq("promo_code_id", promo.id);
		if ((count || 0) >= promo.max_uses) {
			return { ok: false as const, error: "Ce code promo a atteint sa limite d'utilisation." };
		}
	}

	const pricing = computeOrderPricing({
		cartons: params.cartons,
		promo
	});

	return {
		ok: true as const,
		promo,
		pricing
	};
};
