'use client';

import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * A cashier must know the moment the connection drops — before pressing "pay"
 * on a sale that cannot be saved, not after. Rendered once at the root.
 */
export function ConnectionBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      className="safe-bottom fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-md items-center gap-2.5 rounded-[var(--radius-md)] bg-ink px-4 py-3 text-[13px] font-semibold text-on-inverse shadow-lg"
    >
      <WifiOff className="size-4 shrink-0 text-warning" aria-hidden="true" />
      <span>أنت غير متصل بالإنترنت — لن تُحفظ أي عملية حتى يعود الاتصال.</span>
    </div>
  );
}
