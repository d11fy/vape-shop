import { Skeleton, StatCardSkeleton } from '@/ui/primitives/skeleton';

/**
 * Route-level loading state. Mirrors the common page rhythm — header, tiles,
 * panels — so navigation feels like the page filling in rather than a flash.
 */
export default function AppLoading() {
  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3.5 w-60" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>

      <StatCardSkeleton />

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="rounded-[var(--radius-md)] border border-line-subtle bg-card p-5 lg:col-span-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-5 h-[220px] w-full" />
        </div>
        <div className="rounded-[var(--radius-md)] border border-line-subtle bg-card p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-5 h-[220px] w-full" />
        </div>
      </div>
    </div>
  );
}
