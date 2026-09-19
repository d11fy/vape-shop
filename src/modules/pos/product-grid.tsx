'use client';

import { memo } from 'react';
import { PackageX, Search } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useFormat } from '@/ui/format';
import { EmptyState } from '@/ui/feedback/empty-state';
import { Skeleton } from '@/ui/primitives/skeleton';
import type { PosProduct } from './queries';

/**
 * The tap-to-add catalogue.
 *
 * Cards are large enough to hit reliably on a phone held in one hand, and each
 * one carries the three facts that decide the sale: what it is, what it costs,
 * and whether there is any left.
 */
export const ProductGrid = memo(function ProductGrid({
  products,
  loading,
  searching,
  onSelect,
  onLongPress,
}: {
  products: PosProduct[];
  loading: boolean;
  searching: boolean;
  onSelect: (product: PosProduct) => void;
  onLongPress?: (product: PosProduct) => void;
}) {
  const fmt = useFormat();

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[var(--radius-md)] border border-line-subtle bg-card p-3"
          >
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="mt-2 h-3 w-1/3" />
            <Skeleton className="mt-4 h-5 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <EmptyState
        variant="search"
        icon={searching ? <Search className="size-6" /> : <PackageX className="size-6" />}
        title={searching ? 'لا توجد نتائج' : 'لا توجد منتجات'}
        description={
          searching
            ? 'جرّب اسماً أقصر، أو امسح الباركود مباشرة.'
            : 'أضف منتجاتك أولاً من صفحة المنتجات لتظهر هنا.'
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => {
        const outOfStock = product.trackInventory && product.stock <= 0;
        const low = product.trackInventory && product.stock > 0 && product.stock <= product.factor * 3;
        const saleUnits = product.stock / (product.factor || 1000);

        return (
          <button
            key={product.variantId}
            type="button"
            onClick={() => onSelect(product)}
            onContextMenu={(event) => {
              if (!onLongPress) return;
              event.preventDefault();
              onLongPress(product);
            }}
            className={cn(
              'group relative flex min-h-[104px] flex-col justify-between rounded-[var(--radius-md)] border p-3 text-start transition-all',
              'active:scale-[0.98] focus-visible:shadow-[var(--ring-accent)] focus-visible:outline-none',
              outOfStock
                ? 'border-line-subtle bg-sunken/60 opacity-70'
                : 'border-line-subtle bg-card hover:border-accent-border hover:shadow-sm',
            )}
          >
            {product.categoryColor && (
              <span
                className="absolute inset-y-3 start-0 w-[3px] rounded-full"
                style={{ backgroundColor: product.categoryColor }}
                aria-hidden="true"
              />
            )}

            <div className="ps-2">
              <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-primary">
                {product.productName}
              </p>
              {product.variantName !== 'افتراضي' && (
                <p className="mt-0.5 truncate text-[11.5px] text-tertiary">{product.variantName}</p>
              )}
            </div>

            <div className="mt-2 flex items-end justify-between gap-2 ps-2">
              <span className="num text-[15px] font-bold text-primary">
                {fmt.money(product.sellingPrice)}
              </span>

              {product.trackInventory ? (
                <span
                  className={cn(
                    'num-mixed shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold',
                    outOfStock
                      ? 'bg-danger-soft text-danger'
                      : low
                        ? 'bg-warning-soft text-warning'
                        : 'bg-sunken text-secondary',
                  )}
                >
                  {outOfStock
                    ? 'نفد'
                    : `${saleUnits.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${product.unitLabel}`}
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-sunken px-1.5 py-0.5 text-[10.5px] text-tertiary">
                  خدمة
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
});
