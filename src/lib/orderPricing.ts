export const PRICE_PER_CARTON = 95;
export const COST_PER_CARTON = 56;
export const COMPETITOR_PRICE_PER_CARTON = 150;
export const SAVINGS_PER_CARTON = Math.max(
	0,
	COMPETITOR_PRICE_PER_CARTON - PRICE_PER_CARTON,
);

export type PromoShape = {
	id?: string;
	code?: string;
	type?: string | null;
	value?: number | null;
	min_cartons?: number | null;
};

export const computeOrderPricing = (params: {
	cartons: number;
	promo?: PromoShape | null;
}) => {
	const cartons = Math.max(0, Number(params.cartons || 0));
	const subtotal = cartons * PRICE_PER_CARTON;
	const baseTotal = subtotal;

	let promoDiscountAmount = 0;
	const promo = cartons >= Number(params.promo?.min_cartons || 1) ? params.promo : null;
	if (promo?.type === "percent") {
		promoDiscountAmount = baseTotal * (Number(promo.value || 0) / 100);
	} else if (promo?.type === "fixed") {
		promoDiscountAmount = Number(promo.value || 0);
	}

	promoDiscountAmount = Math.max(0, Math.min(baseTotal, promoDiscountAmount));
	const total = Math.max(0, Math.round(baseTotal - promoDiscountAmount));

	return {
		subtotal: Math.round(subtotal),
		// Keep the displayed and recorded discount consistent with the rounded total.
		promoDiscountAmount: Math.round(subtotal) - total,
		total
	};
};
