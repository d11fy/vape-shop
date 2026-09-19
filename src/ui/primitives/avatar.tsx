import { cn } from '@/lib/cn';

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-[11px]',
  md: 'size-9 text-[12px]',
  lg: 'size-11 text-[14px]',
  xl: 'size-16 text-[20px]',
} as const;

/** Deterministic tint per name, so the same person keeps the same colour. */
const PALETTE = [
  'bg-[#DCFCE7] text-[#166534]',
  'bg-[#DBEAFE] text-[#1E40AF]',
  'bg-[#FEF3C7] text-[#92400E]',
  'bg-[#EDE9FE] text-[#5B21B6]',
  'bg-[#FCE7F3] text-[#9D174D]',
  'bg-[#CFFAFE] text-[#155E75]',
];

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '؟';
  if (words.length === 1) return words[0]!.slice(0, 2);
  return `${words[0]![0]}${words[1]![0]}`;
}

function paletteIndex(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % PALETTE.length;
}

export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={cn('shrink-0 rounded-full object-cover', SIZES[size], className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      title={name}
      className={cn(
        'flex shrink-0 select-none items-center justify-center rounded-full font-bold',
        SIZES[size],
        PALETTE[paletteIndex(name)],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/** Square logo tile used for stores and brands. */
export function LogoTile({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={cn(
          'shrink-0 rounded-[var(--radius-sm)] border border-line-subtle object-cover',
          SIZES[size],
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 select-none items-center justify-center rounded-[var(--radius-sm)] bg-ink font-bold text-on-inverse',
        SIZES[size],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
