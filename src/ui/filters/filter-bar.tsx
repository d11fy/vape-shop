'use client';

import { useState } from 'react';
import { Filter, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Button } from '@/ui/primitives/button';
import { Drawer } from '@/ui/overlays/modal';
import { Select } from '@/ui/primitives/input';
import { SearchInput } from '@/ui/forms/search-input';
import { useTableParams } from '@/ui/data/use-table-params';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDefinition {
  /** Query-string key. */
  key: string;
  label: string;
  options: FilterOption[];
  /** Value that means "no filter". */
  allValue?: string;
}

/**
 * Search plus a set of dropdown filters.
 *
 * On a desktop the dropdowns sit inline. On a phone they collapse behind one
 * "تصفية" button that opens a drawer, because four selects in a row is
 * unusable at 375px. Active filters are counted on the button so a filtered
 * list never looks like an empty one.
 */
export function FilterBar({
  searchPlaceholder = 'بحث…',
  filters = [],
  children,
  className,
}: {
  searchPlaceholder?: string;
  filters?: FilterDefinition[];
  /** Extra controls — a period picker, an export button. */
  children?: React.ReactNode;
  className?: string;
}) {
  const table = useTableParams();
  const [open, setOpen] = useState(false);

  const activeCount = filters.reduce((count, filter) => {
    const value = table.get(filter.key);
    const allValue = filter.allValue ?? 'all';
    return value && value !== allValue ? count + 1 : count;
  }, 0);

  const hasAny = activeCount > 0 || table.search !== '';

  return (
    <div className={cn('mb-4', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput placeholder={searchPlaceholder} className="min-w-0 flex-1 sm:max-w-sm" />

        {filters.length > 0 && (
          <Button
            variant="outline"
            onClick={() => setOpen(true)}
            className="lg:hidden"
            iconStart={<Filter className="size-4" />}
          >
            تصفية
            {activeCount > 0 && (
              <span className="num ms-1 rounded-full bg-ink px-1.5 text-[11px] text-on-inverse">
                {activeCount}
              </span>
            )}
          </Button>
        )}

        <div className="hidden items-center gap-2 lg:flex">
          {filters.map((filter) => (
            <Select
              key={filter.key}
              size="md"
              aria-label={filter.label}
              value={table.get(filter.key) ?? filter.allValue ?? 'all'}
              onChange={(event) => table.setParam(filter.key, event.target.value)}
              className="w-auto min-w-36"
            >
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          ))}
        </div>

        {children}

        {hasAny && (
          <Button
            variant="ghost"
            size="sm"
            onClick={table.reset}
            iconStart={<X className="size-3.5" />}
          >
            إزالة التصفية
          </Button>
        )}
      </div>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="تصفية النتائج"
        width="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                table.reset();
                setOpen(false);
              }}
            >
              إعادة تعيين
            </Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              عرض النتائج
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {filters.map((filter) => (
            <label key={filter.key} className="block space-y-1.5">
              <span className="text-[13px] font-semibold text-primary">{filter.label}</span>
              <Select
                value={table.get(filter.key) ?? filter.allValue ?? 'all'}
                onChange={(event) => table.setParam(filter.key, event.target.value)}
              >
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
          ))}
        </div>
      </Drawer>
    </div>
  );
}
