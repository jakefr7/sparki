'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

const StepContext = createContext<{ back: () => void; next: () => void } | null>(null);
const STEP_VIEWS = ['plan', 'care', 'discharge', 'record'] as const;
export function useVisitStep() { return useContext(StepContext); }
export function VisitCareSections({ plan, care, discharge, record, examHref, initialSection = 0, canContinueToDischarge = true }: { plan: ReactNode; care: ReactNode; discharge: ReactNode; record: ReactNode; examHref: string; initialSection?: number; canContinueToDischarge?: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState(initialSection);
  const heading = useRef<HTMLParagraphElement>(null);
  function move(index: number) {
    setActive(index);
    const url = new URL(window.location.href);
    url.searchParams.set('view', STEP_VIEWS[index]!);
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
    requestAnimationFrame(() => {
      heading.current?.scrollIntoView({ block: 'start' });
      heading.current?.focus({ preventScroll: true });
    });
  }
  return <StepContext.Provider value={{ back: () => move(Math.max(0, active - 1)), next: () => move(Math.min(3, active + 1)) }}>
    <div className="visit-care-sections visit-care-sections--guided">
      <p className="visit-step-caption" ref={heading} tabIndex={-1}>Step {active + 2} of 5 · {['Treatment plan', 'Care', 'Discharge', 'Visit overview'][active]}</p>
      {[plan, care, discharge, record].map((content, index) => <div key={index} hidden={active !== index}>{content}</div>)}
      {active === 0 ? <footer className="visit-step-actions"><Link className="visit-stage-navigation__link" href={examHref}>← Back to exam</Link><span /><button type="button" className="button-primary" onClick={() => move(1)}>Continue to care →</button></footer> : null}
      {active === 1 ? <footer className="visit-step-actions"><button type="button" className="visit-stage-navigation__link" onClick={() => move(0)}>← Back to treatment plan</button><button type="button" className="button-primary" disabled={!canContinueToDischarge} onClick={() => move(2)}>Continue to discharge →</button></footer> : null}
    </div>
  </StepContext.Provider>;
}
