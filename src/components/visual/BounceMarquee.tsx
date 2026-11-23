import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

export interface BounceMarqueeProps {
  children: ReactNode;
  className?: string;
}

interface MarqueeMetrics {
  overflowPx: number;
  durationSec: number;
}

const SEAMLESS_GAP_PX = 36;

/**
 * Conditionally applies a seamless right-to-left horizontal marquee loop
 * ONLY when the rendered label overflows its container. When it fits,
 * renders static text with zero motion or duplicate nodes.
 */
export function BounceMarquee({ children, className = '' }: BounceMarqueeProps) {
  const viewportRef = useRef<HTMLSpanElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [metrics, setMetrics] = useState<MarqueeMetrics>({ overflowPx: 0, durationSec: 6 });

  const measure = () => {
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!viewport || !text) return;

    const textWidth = text.scrollWidth;
    const overflow = Math.max(0, Math.ceil(textWidth - viewport.clientWidth));
    if (overflow > 1) {
      const loopDistance = textWidth + SEAMLESS_GAP_PX;
      const durationSec = Math.max(4.2, Math.min(18, Number((loopDistance / 34).toFixed(2))));
      setMetrics((prev) =>
        prev.overflowPx === overflow && prev.durationSec === durationSec
          ? prev
          : { overflowPx: overflow, durationSec }
      );
    } else {
      setMetrics((prev) => (prev.overflowPx === 0 ? prev : { overflowPx: 0, durationSec: 6 }));
    }
  };

  useLayoutEffect(() => {
    measure();
  }, [children]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!viewport || !text) return;

    let rafId = 0;
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(measure);
    };

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(scheduleMeasure);
      ro.observe(viewport);
      ro.observe(text);
    }

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      void document.fonts.ready.then(scheduleMeasure);
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      ro?.disconnect();
    };
  }, []);

  const active = metrics.overflowPx > 1;
  const style = active
    ? ({
        '--sp-marquee-duration': `${metrics.durationSec}s`,
      } as CSSProperties)
    : undefined;

  return (
    <span
      ref={viewportRef}
      className={`sp-marquee-viewport block min-w-0 max-w-full overflow-hidden whitespace-nowrap text-left ${
        active ? 'sp-marquee-masked' : ''
      } ${className}`}
    >
      {active ? (
        <span style={style} className="sp-marquee-seamless">
          <span className="inline-flex items-center shrink-0 pr-9">
            <span ref={textRef} className="inline-flex items-center whitespace-nowrap">
              {children}
            </span>
          </span>
          <span
            aria-hidden="true"
            className="inline-flex items-center shrink-0 pr-9 pointer-events-none select-none"
          >
            {children}
          </span>
        </span>
      ) : (
        <span ref={textRef} className="inline-flex items-center whitespace-nowrap">
          {children}
        </span>
      )}
    </span>
  );
}
