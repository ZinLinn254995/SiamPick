import { useEffect, useRef, type RefObject } from 'react';

let activeBodyScrollLocks = 0;
let previousBodyOverflow = '';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function getScrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return;
    if (activeBodyScrollLocks === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    activeBodyScrollLocks += 1;

    return () => {
      activeBodyScrollLocks = Math.max(0, activeBodyScrollLocks - 1);
      if (activeBodyScrollLocks === 0) {
        document.body.style.overflow = previousBodyOverflow;
      }
    };
  }, [locked]);
}

interface UseDialogA11yOptions {
  isOpen: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  closeOnEscape?: boolean;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogA11y({
  isOpen,
  containerRef,
  onClose,
  closeOnEscape = true,
}: UseDialogA11yOptions): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const triggerElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const getFocusables = (): HTMLElement[] => {
      const container = containerRef.current;
      if (!container) return [];
      return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el.getClientRects().length > 0
      );
    };

    const rafId = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      if (container.contains(document.activeElement)) return;
      const focusables = getFocusables();
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        container.focus();
      }
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        onCloseRef.current();
        return;
      }

      if (event.key === 'Tab') {
        const container = containerRef.current;
        if (!container) return;
        const focusables = getFocusables();
        if (focusables.length === 0) {
          event.preventDefault();
          container.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (event.shiftKey) {
          if (!active || active === first || !container.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else if (!active || active === last || !container.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', handleKeyDown);
      if (triggerElement?.isConnected) {
        triggerElement.focus();
      }
    };
  }, [isOpen, containerRef, closeOnEscape]);
}
