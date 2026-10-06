import assert from "node:assert/strict";
import test from "node:test";
import { computeOrderPricing } from "../src/lib/orderPricing.ts";

test("a carton costs 95 EUR for single and multiple carton orders", () => {
	for (const [cartons, total] of [[1, 95], [2, 190], [10, 950]]) {
		assert.deepEqual(computeOrderPricing({ cartons }), {
			subtotal: total,
			promoDiscountAmount: 0,
			total
		});
	}
});

test("percentage promotions apply to the 95 EUR carton price", () => {
	assert.deepEqual(computeOrderPricing({ cartons: 2, promo: { type: "percent", value: 10 } }), {
		subtotal: 190,
		promoDiscountAmount: 19,
		total: 171
	});
});

test("fixed promotions apply once per order", () => {
	assert.deepEqual(computeOrderPricing({ cartons: 2, promo: { type: "fixed", value: 15 } }), {
		subtotal: 190,
		promoDiscountAmount: 15,
		total: 175
	});
});

test("changing quantity applies promotions only at their minimum carton count", () => {
	const promo = { type: "percent", value: 10, min_cartons: 2 };
	assert.equal(computeOrderPricing({ cartons: 1, promo }).total, 95);
	assert.equal(computeOrderPricing({ cartons: 2, promo }).total, 171);
	assert.equal(computeOrderPricing({ cartons: 3, promo }).total, 257);
	assert.equal(computeOrderPricing({ cartons: 1, promo }).promoDiscountAmount, 0);
});

test("a promotion never makes the order negative or raises its price", () => {
	for (const promo of [{ type: "fixed", value: 100 }, { type: "percent", value: 150 }]) {
		assert.deepEqual(computeOrderPricing({ cartons: 1, promo }), {
			subtotal: 95,
			promoDiscountAmount: 95,
			total: 0
		});
	}
	assert.equal(computeOrderPricing({ cartons: 1, promo: { type: "fixed", value: -10 } }).total, 95);
});

test("the recorded discount matches the existing whole-euro total rounding", () => {
	assert.deepEqual(computeOrderPricing({ cartons: 1, promo: { type: "percent", value: 10 } }), {
		subtotal: 95,
		promoDiscountAmount: 9,
		total: 86
	});
	for (let cartons = 1; cartons <= 10; cartons++) {
		for (let value = 0; value <= 100; value++) {
			const pricing = computeOrderPricing({ cartons, promo: { type: "percent", value } });
			assert.equal(pricing.subtotal - pricing.promoDiscountAmount, pricing.total);
		}
	}
});
