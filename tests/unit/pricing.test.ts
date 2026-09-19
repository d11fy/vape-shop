import { describe, expect, it } from 'vitest';

import { allocateTender } from '@/modules/payments/service';
import { priceSale, type LineInput } from '@/modules/sales/pricing';

const ONE = 1000; // one sale unit of a counted item, in base units ×1000

function line(overrides: Partial<LineInput> & { unitPrice: number; quantity?: number }): LineInput {
  return {
    variantId: overrides.variantId ?? `v-${overrides.unitPrice}`,
    quantity: overrides.quantity ?? ONE,
    factor: overrides.factor ?? ONE,
    unitPrice: overrides.unitPrice,
    lineDiscount: overrides.lineDiscount,
    costPerBase: overrides.costPerBase,
  };
}

describe('invoice pricing', () => {
  it('keeps its invariants with line and invoice discounts', () => {
    const priced = priceSale(
      [
        line({ unitPrice: 4500, quantity: 2 * ONE, lineDiscount: 500 }),
        line({ unitPrice: 1999 }),
        line({ unitPrice: 333, quantity: 3 * ONE }),
      ],
      700,
    );

    const lineTotals = priced.lines.reduce((sum, l) => sum + l.lineTotal, 0);
    expect(lineTotals).toBe(priced.subtotal - priced.discountTotal);
    expect(priced.netTotal).toBe(lineTotals);
    expect(priced.discountTotal).toBe(500 + 700);
    expect(priced.total).toBe(priced.netTotal);
  });

  it('never lets a discount exceed what it discounts', () => {
    const priced = priceSale([line({ unitPrice: 1000, lineDiscount: 5000 })], 99_999);
    expect(priced.total).toBe(0);
    expect(priced.lines[0]?.lineTotal).toBe(0);
  });

  it('adds exclusive tax on top and reports profit without it', () => {
    const priced = priceSale(
      // Cost per base unit is minor units ×1e6: 60.00 a piece → 6000 × 1e6.
      [line({ unitPrice: 10_000, costPerBase: 6000 * 1_000_000 })],
      0,
      { enabled: true, rateBps: 1500, inclusive: false },
    );
    expect(priced.taxTotal).toBe(1500);
    expect(priced.total).toBe(11_500);
    // Revenue excluding tax (100.00) minus cost (60.00).
    expect(priced.cogsTotal).toBe(6000);
    expect(priced.profitTotal).toBe(4000);
  });

  it('carves inclusive tax out of the price — the customer pays the sticker', () => {
    const priced = priceSale([line({ unitPrice: 11_500 })], 0, {
      enabled: true,
      rateBps: 1500,
      inclusive: true,
    });
    expect(priced.total).toBe(11_500);
    expect(priced.taxTotal).toBe(1500);
    expect(priced.profitTotal).toBe(10_000);
  });

  it('spreads tax over lines so they add back to the header exactly', () => {
    const priced = priceSale(
      [line({ unitPrice: 333 }), line({ unitPrice: 333 }), line({ unitPrice: 334 })],
      0,
      { enabled: true, rateBps: 1500, inclusive: false },
    );
    expect(priced.lines.reduce((sum, l) => sum + l.taxAmount, 0)).toBe(priced.taxTotal);
  });

  it('counts sales as revenue, not profit: COGS comes off first', () => {
    // Sold at 45.00, bought at 30.00 — profit is 15.00, not 45.00.
    const priced = priceSale([line({ unitPrice: 4500, costPerBase: 3000 * 1_000_000 })], 0);
    expect(priced.total).toBe(4500);
    expect(priced.profitTotal).toBe(1500);
  });
});

describe('tender allocation', () => {
  it('gives change from cash only', () => {
    const result = allocateTender([{ methodId: 'cash', amount: 10_000, isCash: true }], 8500);
    expect(result.paidTotal).toBe(8500);
    expect(result.change).toBe(1500);
    expect(result.applied).toEqual([{ methodId: 'cash', amount: 8500, reference: undefined }]);
  });

  it('applies card before cash when a payment is split', () => {
    const result = allocateTender(
      [
        { methodId: 'cash', amount: 5000, isCash: true },
        { methodId: 'card', amount: 6000, isCash: false },
      ],
      10_000,
    );
    expect(result.applied.map((a) => a.methodId)).toEqual(['card', 'cash']);
    expect(result.paidTotal).toBe(10_000);
    expect(result.change).toBe(1000);
  });

  it('leaves the rest as debt on a partial payment', () => {
    const result = allocateTender([{ methodId: 'cash', amount: 3000, isCash: true }], 10_000);
    expect(result.paidTotal).toBe(3000);
    expect(result.change).toBe(0);
  });

  it('refuses an over-tendered card payment instead of inventing change', () => {
    expect(() =>
      allocateTender([{ methodId: 'card', amount: 12_000, isCash: false }], 10_000),
    ).toThrow();
  });
});
