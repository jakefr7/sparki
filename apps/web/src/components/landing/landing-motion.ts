'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Landing-page motion primitives — no animation-library dependency.
 *
 * Everything here is transform/opacity only, driven by one shared
 * requestAnimationFrame loop, and completely inert when the visitor prefers
 * reduced motion (the hooks simply don't start their loops, and the module CSS
 * drops every transition/animation). The continuous feel of the page comes
 * from choreography — one product canvas being re-posed as scenes cross-fade —
 * not from hijacking the scrollbar.
 */

export const clamp = (value: number, min = 0, max = 1) =>
  value < min ? min : value > max ? max : value;

export const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/** Symmetric ease, gentle at both ends — the default for scrubbed poses. */
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Maps a global 0..1 progress onto a [start,end] sub-range, eased, clamped. */
export const segment = (progress: number, start: number, end: number, ease = easeInOutCubic) =>
  ease(clamp((progress - start) / (end - start)));

// --- one shared ticker ------------------------------------------------------

type Ticker = (now: number) => void;
const tickers = new Set<Ticker>();
let rafId = 0;

function loop(now: number) {
  for (const tick of tickers) tick(now);
  rafId = tickers.size ? requestAnimationFrame(loop) : 0;
}

function addTicker(tick: Ticker): () => void {
  tickers.add(tick);
  if (!rafId) rafId = requestAnimationFrame(loop);
  return () => {
    tickers.delete(tick);
    if (!tickers.size && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };
}

// --- reduced motion -------------------------------------------------------

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return reduced;
}

// --- scroll rail progress ----------------------------------------------------

/**
 * Reports 0..1 progress of a tall "rail" element as it passes a sticky child
 * through the viewport. `onProgress` fires every frame the value changes (for
 * writing CSS custom properties straight to the DOM); `onStep` fires only when
 * the quantised index changes (for cheap React state updates).
 */
export function useScrollRail(
  ref: React.RefObject<HTMLElement | null>,
  {
    enabled,
    steps = 1,
    onProgress,
    onStep,
  }: {
    enabled: boolean;
    steps?: number;
    onProgress?: (progress: number) => void;
    onStep?: (index: number) => void;
  },
) {
  const progressRef = useRef(0);
  const stepRef = useRef(-1);
  const onProgressRef = useRef(onProgress);
  const onStepRef = useRef(onStep);
  onProgressRef.current = onProgress;
  onStepRef.current = onStep;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let last = -1;
    const tick = () => {
      const rect = el.getBoundingClientRect();
      const distance = Math.max(1, rect.height - window.innerHeight);
      const raw = clamp(-rect.top / distance);
      if (raw !== last) {
        last = raw;
        progressRef.current = raw;
        onProgressRef.current?.(raw);
        const index = Math.min(steps - 1, Math.floor(raw * steps));
        if (index !== stepRef.current) {
          stepRef.current = index;
          onStepRef.current?.(index);
        }
      }
    };

    tick();
    return addTicker(tick);
  }, [ref, enabled, steps]);

  return progressRef;
}

// --- pointer-driven depth --------------------------------------------------

/**
 * Writes lerped, normalised pointer coordinates (`--px` / `--py`, roughly
 * -1..1) onto `ref`, for parallax depth between layers. Fine-pointer devices
 * only; a no-op under reduced motion. Returns nothing — layers read the vars
 * in CSS.
 */
export function usePointerDepth(
  ref: React.RefObject<HTMLElement | null>,
  { enabled }: { enabled: boolean },
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const onMove = (event: PointerEvent) => {
      targetX = (event.clientX / window.innerWidth) * 2 - 1;
      targetY = (event.clientY / window.innerHeight) * 2 - 1;
    };

    const tick = () => {
      currentX = lerp(currentX, targetX, 0.06);
      currentY = lerp(currentY, targetY, 0.06);
      el.style.setProperty('--px', currentX.toFixed(4));
      el.style.setProperty('--py', currentY.toFixed(4));
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    const stop = addTicker(tick);
    return () => {
      window.removeEventListener('pointermove', onMove);
      stop();
    };
  }, [ref, enabled]);
}

// --- ambient drift -------------------------------------------------------

/**
 * A slow, seamless sine drift written as `--drift` (-1..1) onto `ref` — used
 * for the "the scene is alive even when still" hero float. Off under reduced
 * motion.
 */
export function useAmbientDrift(
  ref: React.RefObject<HTMLElement | null>,
  { enabled, period = 9000 }: { enabled: boolean; period?: number },
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const start = performance.now();
    const tick = (now: number) => {
      const phase = ((now - start) % period) / period;
      el.style.setProperty('--drift', Math.sin(phase * Math.PI * 2).toFixed(4));
      el.style.setProperty('--drift2', Math.sin(phase * Math.PI * 2 + 1.7).toFixed(4));
    };

    return addTicker(tick);
  }, [ref, enabled, period]);
}

// --- imperative tween (control seeks) -------------------------------------

/**
 * Tween a number over `duration` ms with `easeInOutCubic`, invoking `onUpdate`
 * each frame. Used when a tab/keyboard control jumps the choreography to a
 * labelled pose instead of the visitor scrubbing there. Returns a cancel fn.
 */
export function tween(
  from: number,
  to: number,
  duration: number,
  onUpdate: (value: number) => void,
): () => void {
  const start = performance.now();
  let cancelled = false;

  const tick = (now: number) => {
    if (cancelled) return;
    const t = clamp((now - start) / duration);
    onUpdate(lerp(from, to, easeInOutCubic(t)));
    if (t >= 1) stop();
  };

  const stop = addTicker(tick);
  return () => {
    cancelled = true;
    stop();
  };
}
