'use client';

import { useEffect, useRef } from 'react';

/** Prevent the page behind an overlay from scrolling, without layout shift. */
export function useLockBodyScroll(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const { body, documentElement } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingInlineEnd;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingInlineEnd = `${scrollbarWidth}px`;

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingInlineEnd = previousPadding;
    };
  }, [active]);
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Keep keyboard focus inside the overlay while it is open, and hand it back to
 * whatever was focused before when it closes.
 */
export function useFocusTrap(active: boolean, containerRef: React.RefObject<HTMLElement | null>) {
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    previousFocus.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    if (!container) return;

    const focusFirst = () => {
      const target =
        container.querySelector<HTMLElement>('[data-autofocus]') ??
        container.querySelector<HTMLElement>(FOCUSABLE) ??
        container;
      target.focus({ preventScroll: true });
    };

    const frame = requestAnimationFrame(focusFirst);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null || node === document.activeElement,
      );
      if (nodes.length === 0) return;

      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      previousFocus.current?.focus({ preventScroll: true });
    };
  }, [active, containerRef]);
}

/** Close on Escape — expected by every keyboard user. */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onEscape();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [active, onEscape]);
}

/** Fire when a pointer goes down outside the referenced element. */
export function useClickOutside(
  active: boolean,
  refs: Array<React.RefObject<HTMLElement | null>>,
  onOutside: () => void,
): void {
  useEffect(() => {
    if (!active) return;
    const handler = (event: PointerEvent) => {
      const target = event.target as Node;
      for (const ref of refs) {
        if (ref.current?.contains(target)) return;
      }
      onOutside();
    };
    // `capture` so it still fires when a child stops propagation.
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [active, refs, onOutside]);
}

/** True on viewports we treat as "phone" — drives sheet vs. dialog. */
export function useIsMobile(breakpoint = 640): boolean {
  const query = `(max-width: ${breakpoint - 1}px)`;
  const subscribe = (callback: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener('change', callback);
    return () => media.removeEventListener('change', callback);
  };
  return useSyncExternalStoreShim(subscribe, () => window.matchMedia(query).matches, () => false);
}

// A tiny wrapper so the import stays in one place if React's API moves.
import { useSyncExternalStore } from 'react';

function useSyncExternalStoreShim<T>(
  subscribe: (callback: () => void) => () => void,
  getSnapshot: () => T,
  getServerSnapshot: () => T,
): T {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
