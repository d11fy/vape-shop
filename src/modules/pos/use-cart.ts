'use client';

import { useCallback, useEffect, useMemo, useReducer } from 'react';

import { priceSale, type TaxConfig } from '@/modules/sales/pricing';
import type { PosProduct } from './queries';
import { emptyCart, lineKey, newIdempotencyKey, type CartLine, type CartState } from './types';

/**
 * Cart state.
 *
 * A reducer rather than scattered `useState` calls, for two reasons: the totals
 * must always be derived from one consistent snapshot, and the whole cart is
 * mirrored to `localStorage` after every action so a refresh, a phone lock or a
 * dropped connection never loses a half-built basket.
 */

type CartAction =
  | { type: 'add'; product: PosProduct; quantity?: number; wholesale?: boolean }
  | { type: 'setQuantity'; key: string; quantity: number }
  | { type: 'increment'; key: string; steps: number }
  | { type: 'setPrice'; key: string; unitPrice: number }
  | { type: 'setDiscount'; key: string; discount: number }
  | { type: 'remove'; key: string }
  | { type: 'setCustomer'; id: string | null; name: string | null }
  | { type: 'setInvoiceDiscount'; amount: number }
  | { type: 'setNote'; note: string }
  | { type: 'restore'; state: CartState }
  | { type: 'clear' };

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      const { product } = action;
      const step = action.quantity ?? product.factor;
      const price = action.wholesale ? product.wholesalePrice : product.sellingPrice;

      // Same variant at the same price merges into the existing line — a
      // cashier scanning three identical tins expects one row showing ×3.
      const existing = state.lines.find(
        (line) => line.variantId === product.variantId && line.unitPrice === price,
      );

      if (existing) {
        return {
          ...state,
          lines: state.lines.map((line) =>
            line.key === existing.key ? { ...line, quantity: line.quantity + step } : line,
          ),
        };
      }

      const line: CartLine = {
        key: lineKey(product.variantId),
        variantId: product.variantId,
        productId: product.productId,
        label: product.label,
        sku: product.sku,
        unitLabel: product.unitLabel,
        unitKind: product.unitKind,
        factor: product.factor,
        allowsFractional: product.allowsFractional,
        quantity: step,
        unitPrice: price,
        listPrice: product.sellingPrice,
        discount: 0,
        availableAtAdd: product.stock,
        trackInventory: product.trackInventory,
      };

      return { ...state, lines: [...state.lines, line] };
    }

    case 'setQuantity': {
      const quantity = Math.max(0, Math.round(action.quantity));
      if (quantity === 0) {
        return { ...state, lines: state.lines.filter((line) => line.key !== action.key) };
      }
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.key === action.key ? { ...line, quantity } : line,
        ),
      };
    }

    case 'increment': {
      return {
        ...state,
        lines: state.lines
          .map((line) => {
            if (line.key !== action.key) return line;
            // Fractional items step by a tenth of the sale unit (100g on a kilo),
            // countable ones by a whole unit.
            const step = line.allowsFractional
              ? Math.max(1, Math.round(line.factor / 10))
              : line.factor;
            return { ...line, quantity: line.quantity + step * action.steps };
          })
          .filter((line) => line.quantity > 0),
      };
    }

    case 'setPrice':
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.key === action.key ? { ...line, unitPrice: Math.max(0, action.unitPrice) } : line,
        ),
      };

    case 'setDiscount':
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.key === action.key ? { ...line, discount: Math.max(0, action.discount) } : line,
        ),
      };

    case 'remove':
      return { ...state, lines: state.lines.filter((line) => line.key !== action.key) };

    case 'setCustomer':
      return { ...state, customerId: action.id, customerName: action.name };

    case 'setInvoiceDiscount':
      return { ...state, invoiceDiscount: Math.max(0, action.amount) };

    case 'setNote':
      return { ...state, note: action.note.slice(0, 500) };

    case 'restore':
      return action.state;

    case 'clear':
      // A fresh idempotency key per basket: the previous one is now spent.
      return { ...emptyCart(), idempotencyKey: newIdempotencyKey() };

    default:
      return state;
  }
}

const STORAGE_PREFIX = 'vs-cart';

export interface CartTotals {
  subtotal: number;
  discountTotal: number;
  netTotal: number;
  taxTotal: number;
  total: number;
  itemCount: number;
  unitCount: number;
}

export function useCart(branchId: string, tax: TaxConfig) {
  const [state, dispatch] = useReducer(reducer, undefined, emptyCart);
  const storageKey = `${STORAGE_PREFIX}:${branchId}`;

  // Restore once on mount. Done in an effect (not lazy init) so the server and
  // the first client render agree and hydration stays clean.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as CartState;
      if (Array.isArray(parsed.lines) && parsed.lines.length > 0) {
        dispatch({ type: 'restore', state: parsed });
      }
    } catch {
      // Corrupted or unavailable storage — start with an empty cart.
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      if (state.lines.length === 0) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Storage full or blocked: the cart still works, it just won't survive a refresh.
    }
  }, [state, storageKey]);

  const totals = useMemo<CartTotals>(() => {
    const priced = priceSale(
      state.lines.map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
        factor: line.factor,
        unitPrice: line.unitPrice,
        lineDiscount: line.discount,
      })),
      state.invoiceDiscount,
      tax,
    );

    return {
      subtotal: priced.subtotal,
      discountTotal: priced.discountTotal,
      netTotal: priced.netTotal,
      taxTotal: priced.taxTotal,
      total: priced.total,
      itemCount: state.lines.length,
      unitCount: state.lines.reduce(
        (sum, line) => sum + line.quantity / (line.factor || 1000),
        0,
      ),
    };
  }, [state.lines, state.invoiceDiscount, tax]);

  /** Per-line totals, in the same order as `state.lines`. */
  const lineTotals = useMemo(() => {
    const priced = priceSale(
      state.lines.map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
        factor: line.factor,
        unitPrice: line.unitPrice,
        lineDiscount: line.discount,
      })),
      state.invoiceDiscount,
      tax,
    );
    return new Map(state.lines.map((line, index) => [line.key, priced.lines[index]!]));
  }, [state.lines, state.invoiceDiscount, tax]);

  const actions = useMemo(
    () => ({
      add: (product: PosProduct, quantity?: number, wholesale?: boolean) =>
        dispatch({ type: 'add', product, quantity, wholesale }),
      setQuantity: (key: string, quantity: number) =>
        dispatch({ type: 'setQuantity', key, quantity }),
      increment: (key: string, steps: number) => dispatch({ type: 'increment', key, steps }),
      setPrice: (key: string, unitPrice: number) => dispatch({ type: 'setPrice', key, unitPrice }),
      setDiscount: (key: string, discount: number) =>
        dispatch({ type: 'setDiscount', key, discount }),
      remove: (key: string) => dispatch({ type: 'remove', key }),
      setCustomer: (id: string | null, name: string | null) =>
        dispatch({ type: 'setCustomer', id, name }),
      setInvoiceDiscount: (amount: number) => dispatch({ type: 'setInvoiceDiscount', amount }),
      setNote: (note: string) => dispatch({ type: 'setNote', note }),
      clear: () => dispatch({ type: 'clear' }),
    }),
    [],
  );

  const clearStorage = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Nothing to do.
    }
  }, [storageKey]);

  return { cart: state, totals, lineTotals, ...actions, clearStorage };
}
