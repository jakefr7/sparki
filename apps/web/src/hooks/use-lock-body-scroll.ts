'use client';

import { useEffect } from 'react';

/** Locks page scroll behind a modal/overlay while it's open. Ref-counted via
 *  a shared counter so multiple overlays mounted at once (or React strict
 *  mode's double-effect) don't unlock the page while another is still open.
 *
 *  Locks <html>, not <body>: globals.css sets `overflow-x: hidden` on the
 *  root element, which (per the CSS spec) stops body's overflow from
 *  propagating to the viewport — <html> is the actual scrolling box here,
 *  so toggling body.style.overflow alone does nothing. */
let lockCount = 0;
let previousOverflow = '';

export function useLockBodyScroll(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const root = document.documentElement;
    if (lockCount === 0) {
      previousOverflow = root.style.overflow;
      root.style.overflow = 'hidden';
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        root.style.overflow = previousOverflow;
      }
    };
  }, [active]);
}
