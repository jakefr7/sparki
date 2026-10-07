'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import s from './landing.module.css';
import {
  useAmbientDrift,
  usePointerDepth,
  useReducedMotion,
  useRevealOnScroll,
  useScrollRail,
  useViewportAtLeast,
} from './landing-motion';
import { PublicHeader } from './public-header';
import { SparkiCanvas, type SparkiJourney, type SparkiScene } from './sparki-surfaces';
import { SparkiLogo } from '../sparki-logo';

const STEPS: ReadonlyArray<Omit<SparkiJourney, 'step'> & { name: string }> = [
  { name: 'Appointment', label: 'Scheduled', action: 'Appointment scheduled', detail: 'Wellness exam · 9:30 AM', tone: 'accent', note: 'Patient history stays connected to the appointment.', owner: 'Receptionist' },
  { name: 'Check In', label: 'Waiting', action: 'Checked in', detail: 'Arrived · Waiting for intake', tone: 'waiting', note: 'The clinical team can see that Maple is ready.', owner: 'Receptionist' },
  { name: 'Begin Intake', label: 'In Intake', action: 'Intake in progress', detail: 'Room 2 · Vitals recorded', tone: 'active', note: 'Technician observations retain their source.', owner: 'Technician' },
  { name: 'Ready for Veterinarian', label: 'Ready', action: 'Ready for veterinarian', detail: 'Intake complete · Room 2', tone: 'exam', note: 'The next handoff is visible to the whole team.', owner: 'Technician' },
  { name: 'Exam', label: 'In Exam', action: 'Exam in progress', detail: 'Room 2 · Dr. Reyes', tone: 'exam', note: 'Exam, plan, and patient context stay together.', owner: 'Veterinarian' },
  { name: 'Treatment', label: 'In Care', action: 'Ordered care', detail: 'Care plan · Ready for the team', tone: 'active', note: 'Ordered care and its performer stay connected to the visit.', owner: 'Technician' },
  { name: 'Checkout', label: 'Checkout', action: 'Ready for checkout', detail: 'Discharge instructions prepared', tone: 'checkout', note: 'Departure and record finalization stay distinct.', owner: 'Receptionist' },
  { name: 'Record', label: 'Record', action: 'Record review', detail: 'SOAP · Review and finalize', tone: 'completed', note: 'The veterinarian reviews and finalizes the record separately from departure.', owner: 'Veterinarian' },
];
// One visit (Maple Reyes' 9:30 wellness exam) threaded through all four
// cards as concrete proof, reusing the same patient/stage names as the
// patient-journey section above rather than inventing separate examples.
function StageTrack({ stages, current }: { stages: readonly string[]; current: number }) {
  return (
    <span className={s.areaTrack}>
      {stages.map((stage, i) => (
        <span key={stage} data-state={i < current ? 'done' : i === current ? 'current' : undefined}>
          {stage}
        </span>
      ))}
    </span>
  );
}
const AREAS: ReadonlyArray<[string, string, ReactNode]> = [
  [
    'Scheduling',
    'See the day ahead and keep every handoff moving.',
    <div className={s.areaProof} key="scheduling-proof"><strong>Maple Reyes · 9:30 AM</strong><span>Wellness exam</span></div>,
  ],
  [
    'Clients & Patients',
    'Keep the context behind every visit close at hand.',
    <div className={s.areaProof} key="patients-proof"><strong>Maple Reyes</strong><span>Golden Retriever · 4 yr · Visit today, 9:30</span></div>,
  ],
  [
    'Clinical Visits',
    'Carry a patient from intake through care and record.',
    <div className={s.areaProof} key="visits-proof"><StageTrack stages={['Intake', 'Exam', 'Treatment']} current={1} /></div>,
  ],
  [
    'Inventory & Operations',
    'Connect supplies, responsibilities, and daily work.',
    <div className={s.areaProof} key="inventory-proof"><strong>Cerenia 16 mg</strong><span>Usage recorded · 38 available</span></div>,
  ],
];
function Arrow() { return <span aria-hidden="true">↗</span>; }
function journey(step: number): SparkiJourney { const item = STEPS[step] ?? STEPS[0]!; return { ...item, step }; }
// Several journey steps truthfully share one surface (Sparki carrying a
// visit forward rather than switching screens); see landing/README.md.
function sceneForStep(step: number): SparkiScene {
  if (step === 0) return 'scheduler'; // Appointment
  if (step <= 3) return 'today'; // Check In, Begin Intake, Ready for Veterinarian
  if (step <= 5) return 'patient'; // Exam, Treatment
  if (step === 6) return 'billing'; // Checkout
  return 'patient'; // Record — the visit's own history view
}

export function LandingPage() {
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const reducedMotion = useReducedMotion();
  // The scroll-driven journey is a desktop refinement, not a requirement —
  // tablet, mobile, and reduced-motion visitors keep the plain click-tabs.
  const desktopRail = useViewportAtLeast(1001);
  const railActive = desktopRail && !reducedMotion;
  const railRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const areaGridRef = useRef<HTMLDivElement>(null);
  const finalCtaRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setReady(true); }, []);
  useScrollRail(railRef, { enabled: railActive, steps: STEPS.length, onStep: setStep });
  useAmbientDrift(heroRef, { enabled: !reducedMotion, period: 14000 });
  usePointerDepth(previewRef, { enabled: !reducedMotion });
  useRevealOnScroll(areaGridRef, { enabled: !reducedMotion });
  useRevealOnScroll(finalCtaRef, { enabled: !reducedMotion });
  // On the desktop rail, a step button scrolls to that step's position —
  // scroll position stays the single source of truth for `step`, so native
  // scrolling (forward, backward, or landing here after a refresh) always
  // agrees with whichever step a click last requested. Elsewhere it's a
  // plain, instant tab switch, same as today.
  const goToStep = (index: number) => {
    const rail = railRef.current;
    if (railActive && rail) {
      const rect = rail.getBoundingClientRect();
      const scrollable = Math.max(1, rect.height - window.innerHeight);
      const top = rect.top + window.scrollY + ((index + 0.5) / STEPS.length) * scrollable;
      window.scrollTo({ top, behavior: 'smooth' });
    } else {
      setStep(index);
    }
  };
  const current = journey(step);
  return <div className={s.landing} id="top" data-ready={ready ? 'true' : undefined}>
    <a className={s.skip} href="#main">Skip to content</a>
    <PublicHeader landing />
    <main id="main">
      <section ref={heroRef} className={s.hero} aria-labelledby="hero-heading"><div className={s.heroCopy}><p className={s.eyebrow}>The veterinary practice operating system</p><h1 id="hero-heading">Your clinic.<br /><span>Finally in sync.</span></h1><p className={s.lede}>From the first appointment to the final record. Bring your patients, people, and daily work together in one calm, connected workspace.</p><div className={s.actions}><Link href="/pricing" className={s.button}>Get Started <Arrow /></Link><a href="#product" className={s.textLink}>Explore Sparki <span>↓</span></a></div></div><div className={s.heroProduct} aria-label="Sparki product preview"><div className={s.previewLabel}><span><span className={s.contextDot} /> THE CONNECTED CLINIC</span><span>One workspace. A clearer day.</span></div><div ref={previewRef} className={s.preview}><SparkiCanvas scene="dashboard" role="veterinarian" journey={journey(0)} className={s.canvas} /></div><div className={s.mobileSnapshot} aria-label="Illustrative clinic day"><div><span>Today’s appointments</span><strong>24 <small>scheduled</small></strong></div><div><span>Next handoff</span><strong>Maple Reyes <small>Ready for doctor · Room 2</small></strong></div></div><div className={s.productContext}><span className={s.contextDot} />Today at a glance <strong>Appointments · Patients · Clinic flow</strong><small>Illustrative product preview</small></div></div></section>
      <div className={s.continuity}><p>Less chasing. More caring.</p><span>Patient context, always close</span><span>Clear ownership at each handoff</span><span>One connected clinic day</span></div>
      <section className={s.flow} id="product" aria-labelledby="flow-heading"><div ref={railRef} className={railActive ? `${s.flowRail} ${s.flowRailActive}` : s.flowRail}><div className={s.flowSticky}><div className={s.flowCopy}><p className={s.eyebrow}>The patient journey</p><h2 id="flow-heading">Every patient.<br /><span>A clear next step.</span></h2><p className={s.body}>One connected visit from appointment to the final record. The right person sees what needs to happen next.</p><p className={s.flowHint}>Explore a visit, step by step ↓</p><div className={s.stepList} aria-label="Patient flow">{STEPS.map((item, index) => <button key={item.name} type="button" aria-pressed={index === step} onClick={() => goToStep(index)}><span>{String(index + 1).padStart(2, '0')}</span>{item.name}</button>)}</div></div><div className={s.flowProduct}><div className={s.preview}><SparkiCanvas scene={sceneForStep(step)} role="veterinarian" journey={current} className={s.canvas} /></div><div className={s.flowCaption} aria-live="polite"><span>{current.label}</span><strong>{current.action}</strong><small>{current.detail}</small><p>{current.note}</p><small>Next with: {current.owner}</small></div></div></div></div></section>
      <section className={s.solutions} id="solutions" aria-labelledby="solutions-heading"><div className={s.sectionIntro}><p className={s.eyebrow}>One connected workspace</p><h2 id="solutions-heading">One system.<br /><span>Every part of the clinic.</span></h2><p className={s.body}>Sparki keeps the clinic’s major workflows connected without asking your team to carry the gaps.</p></div><div ref={areaGridRef} className={s.areaGrid}><span className={s.areaThread} aria-hidden="true"><i className={s.areaThreadSeg} data-seg="top" /><i className={s.areaThreadSeg} data-seg="bottom" /><i className={s.areaThreadNode} /></span>{AREAS.map(([name, copy, proof], index) => <div className={s.area} key={name} style={{ ['--i' as string]: index }}><span className={s.areaNumber}>0{index + 1}</span><h3>{name}</h3><p>{copy}</p>{proof}</div>)}</div></section>
      <section ref={finalCtaRef} className={s.finalCta} id="demo"><p className={s.eyebrow}>See Sparki in your clinic</p><h2>Give your clinic<br /><span>a better operating system.</span></h2><p>See how Sparki keeps your patients, people, and daily work connected.</p><Link href="/pricing" className={s.button}>Get Started <Arrow /></Link></section>
    </main>
    <footer className={s.footer}><Link href="#top" className={s.brand} aria-label="Sparki home"><SparkiLogo kind="mark" /><SparkiLogo kind="wordmark" /></Link><span>Built for the people who care.</span><div><Link href="#product">How it works</Link><Link href="/pricing">Pricing <Arrow /></Link><Link href="/login">Sign In <Arrow /></Link><span>© {new Date().getFullYear()} Sparki</span></div></footer>
  </div>;
}
