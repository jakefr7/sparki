'use client';

import Link from 'next/link';
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

const StepContext = createContext<{ back: () => void; next: () => void } | null>(null);
export function useVisitStep() { return useContext(StepContext); }
export function VisitCareSections({ plan, discharge, record, examHref, initialSection = 0 }: { plan: ReactNode; discharge: ReactNode; record: ReactNode; examHref: string; initialSection?: number }) {
  const [active, setActive] = useState(initialSection);
  const heading = useRef<HTMLParagraphElement>(null);
  function move(index: number) {
    setActive(index);
    requestAnimationFrame(() => {
      heading.current?.scrollIntoView({ block: 'start' });
      heading.current?.focus({ preventScroll: true });
    });
  }
  return <StepContext.Provider value={{ back: () => move(Math.max(0, active - 1)), next: () => move(Math.min(2, active + 1)) }}>
    <div className="visit-care-sections visit-care-sections--guided">
      <p className="visit-step-caption" ref={heading} tabIndex={-1}>Step {active + 2} of 4 · {['Care plan', 'Discharge', 'Review & sign'][active]}</p>
      {[plan, discharge, record].map((content, index) => <div key={index} hidden={active !== index}>{content}</div>)}
      {active === 0 ? <footer className="visit-step-actions"><Link className="visit-stage-navigation__link" href={examHref}>← Back to exam</Link><button type="button" className="button-primary" onClick={() => move(1)}>Continue to discharge →</button></footer> : null}
    </div>
  </StepContext.Provider>;
}
