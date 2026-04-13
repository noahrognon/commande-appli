export const PRICE_PER_CARTON = 85;
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
};

export const getVolumeDiscountPercent = (cartons: number) => {
	if (cartons >= 10) return 10;
	if (cartons >= 5) return 7;
	if (cartons >= 3) return 4;
	return 0;
};

export const computeOrderPricing = (params: {
	cartons: number;
	promo?: PromoShape | null;
}) => {
	const cartons = Math.max(0, Number(params.cartons || 0));
	const subtotal = cartons * PRICE_PER_CARTON;
	const volumeDiscountPercent = getVolumeDiscountPercent(cartons);
	const baseTotal = subtotal * (1 - volumeDiscountPercent / 100);

	let promoDiscountAmount = 0;
	const promo = params.promo;
	if (promo?.type === "percent") {
		promoDiscountAmount = baseTotal * (Number(promo.value || 0) / 100);
	} else if (promo?.type === "fixed") {
		promoDiscountAmount = Number(promo.value || 0);
	}

	promoDiscountAmount = Math.max(0, Math.min(baseTotal, promoDiscountAmount));
	const total = Math.max(0, Math.round(baseTotal - promoDiscountAmount));

	return {
		subtotal: Math.round(subtotal),
		volumeDiscountPercent,
		promoDiscountAmount: Math.round(promoDiscountAmount),
		total
	};
};
