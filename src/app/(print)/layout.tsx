/**
 * Print surface.
 *
 * Its own route group so printable documents render without the sidebar, the
 * header or the bottom bar — nothing to hide with `@media print` because none
 * of it is ever there.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-[#e9ebef] print:bg-white">{children}</div>;
}
