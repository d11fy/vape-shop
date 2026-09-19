import type { PosProduct } from './queries';

/**
 * Cart shapes shared by the POS screen and its child components.
 *
 * The cart is intentionally plain data: it is persisted to `localStorage` on
 * every change so a dropped connection, an accidental refresh or a phone
 * locking mid-sale never costs the cashier the basket they just built.
 */

export interface CartLine {
  /** Stable key — a product can appear twice at different prices. */
  key: string;
  variantId: string;
  productId: string;
  label: string;
  sku: string;
  unitLabel: string;
  unitKind: PosProduct['unitKind'];
  /** Base units per sale unit (×1000). */
  factor: number;
  allowsFractional: boolean;
  /** Quantity in base units (×1000). */
  quantity: number;
  /** Price per sale unit, minor units. */
  unitPrice: number;
  /** Catalogue price, kept so the UI can flag an override. */
  listPrice: number;
  discount: number;
  /** On-hand quantity when the line was added — for the "low stock" hint. */
  availableAtAdd: number;
  trackInventory: boolean;
}

export interface CartState {
  lines: CartLine[];
  customerId: string | null;
  customerName: string | null;
  invoiceDiscount: number;
  note: string;
  /** Regenerated after every completed sale; guards against double submit. */
  idempotencyKey: string;
}

export interface TenderRow {
  methodId: string;
  amount: number;
  reference: string;
}

export function emptyCart(): CartState {
  return {
    lines: [],
    customerId: null,
    customerName: null,
    invoiceDiscount: 0,
    note: '',
    idempotencyKey: newIdempotencyKey(),
  };
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function lineKey(variantId: string): string {
  return `${variantId}:${Math.random().toString(36).slice(2, 8)}`;
}

/** Quantity remaining on the shelf if the current basket were completed. */
export function remainingStock(line: CartLine): number {
  return line.availableAtAdd - line.quantity;
}
