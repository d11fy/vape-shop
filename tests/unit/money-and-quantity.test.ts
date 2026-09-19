import { describe, expect, it } from 'vitest';

import {
  allocateByWeight,
  fromMajor,
  parseMoneyInput,
  percentOfBps,
  taxFromInclusive,
} from '@/core/money';
import {
  costAmount,
  lineAmount,
  qtyFromSaleUnits,
  unitCostFromSaleUnitPrice,
  unitCostFromTotal,
  weightedAverageCost,
} from '@/core/quantity';

/**
 * Money is integer minor units and quantities are integer thousandths of a
 * base unit. These tests pin the conversions the whole ledger rests on.
 */

describe('money input', () => {
  it('parses Latin and Arabic-Indic digits to the same minor units', () => {
    expect(parseMoneyInput('12.50')).toBe(1250);
    expect(parseMoneyInput('١٢٫٥٠')).toBe(1250);
    expect(parseMoneyInput('1,250.75')).toBe(125075);
  });

  it('respects the currency decimals — a Kuwaiti dinar has three', () => {
    expect(parseMoneyInput('1.250', 3)).toBe(1250);
    expect(parseMoneyInput('1.25', 2)).toBe(125);
  });

  it('rounds a dropped digit half-up instead of truncating', () => {
    expect(parseMoneyInput('12.345')).toBe(1235);
    expect(fromMajor(12.345)).toBe(1235);
  });

  it('rejects text that is not a number', () => {
    expect(parseMoneyInput('abc')).toBeNull();
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('1.2.3')).toBeNull();
  });
});

describe('tax', () => {
  it('computes exclusive VAT on top of the price', () => {
    expect(percentOfBps(10_000, 1500)).toBe(1500);
  });

  it('extracts the VAT already inside an inclusive price', () => {
    // 115.00 at 15% inclusive contains exactly 15.00 of tax.
    expect(taxFromInclusive(11_500, 1500)).toBe(1500);
  });
});

describe('allocation', () => {
  it('never creates or loses a minor unit', () => {
    const shares = allocateByWeight(100, [1, 1, 1]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);
    expect(shares.sort()).toEqual([33, 33, 34]);
  });

  it('follows the weights', () => {
    expect(allocateByWeight(1000, [3, 1])).toEqual([750, 250]);
  });
});

describe('quantities and cost', () => {
  const PACK_250G = 250_000; // base units (grams) per sale unit, ×1000

  it('reads a sale-unit quantity into base units', () => {
    expect(qtyFromSaleUnits('2', PACK_250G)).toBe(500_000); // 500 g
    expect(qtyFromSaleUnits('0.5', 1_000_000)).toBe(500_000); // half a kilo
    expect(qtyFromSaleUnits('٢', 1000)).toBe(2000); // Arabic digits
    expect(qtyFromSaleUnits('x', 1000)).toBeNull();
  });

  it('prices a line from a per-sale-unit price', () => {
    // Two 250 g packs at 45.00 each.
    expect(lineAmount(4500, 500_000, PACK_250G)).toBe(9000);
    // 100 g of loose tobacco priced 180.00 per kilo.
    expect(lineAmount(18_000, 100_000, 1_000_000)).toBe(1800);
  });

  it('turns a per-pack purchase price into an exact per-gram cost', () => {
    // A 250 g pack bought at 30.00 costs 0.12 per gram = 12 minor units, ×1e6.
    expect(unitCostFromSaleUnitPrice(3000, PACK_250G)).toBe(12_000_000);
    // And the same figure reached through the total value of the stock.
    const value = lineAmount(3000, 5_000_000, PACK_250G);
    expect(unitCostFromTotal(value, 5_000_000)).toBe(12_000_000);
  });

  it('values stock exactly, including large quantities', () => {
    // 5 kg at 0.12 per gram = 600.00.
    expect(costAmount(5_000_000, 12_000_000)).toBe(60_000);
    // Negative differences (a stock-take shortfall) keep their sign:
    // two pieces short at 150.445 each is −300.89.
    expect(costAmount(-2000, 15_044_500_000)).toBe(-30_089);
    // 100 kg at 100.00 per gram — past the range a float multiply keeps exact.
    expect(costAmount(100_000_000, 10_000_000_000)).toBe(1_000_000_000);
  });

  it('keeps a weighted-average cost across purchases at different prices', () => {
    // 10 units at 20.00 and 10 units at 24.00 average to 22.00.
    const unit = 1000;
    const avg = weightedAverageCost(10 * unit, 2000 * 1_000_000, 10 * unit, 2400 * 1_000_000);
    expect(avg).toBe(2200 * 1_000_000);
  });

  it('takes the incoming cost when there was no stock on hand', () => {
    expect(weightedAverageCost(0, 5, 1000, 99)).toBe(99);
    expect(weightedAverageCost(-1000, 5, 3000, 99)).toBe(99);
  });
});
