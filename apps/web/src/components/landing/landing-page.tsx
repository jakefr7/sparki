'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import s from './landing.module.css';
import { SparkiCanvas, type SparkiJourney } from './sparki-surfaces';

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
const AREAS = [
  ['Scheduling', 'See the day ahead and keep every handoff moving.', 'Appointments · Providers · Rooms'],
  ['Clients & Patients', 'Keep the context behind every visit close at hand.', 'Patient history · Client details · Visit records'],
  ['Clinical Visits', 'Carry a patient from intake through care and record.', 'Exam · Care plan · Discharge'],
  ['Inventory & Operations', 'Connect supplies, responsibilities, and daily work.', 'Stock · Usage · Team handoffs'],
] as const;
function Arrow() { return <span aria-hidden="true">↗</span>; }
function journey(step: number): SparkiJourney { const item = STEPS[step] ?? STEPS[0]!; return { ...item, step }; }

export function LandingPage() {
  const [step, setStep] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    const onScroll = () => {
      setScrolled(window.scrollY > 24);

    };
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, []);
  const current = journey(step);
  return <div className={s.landing} id="top" data-ready={ready ? 'true' : undefined}>
    <a className={s.skip} href="#main">Skip to content</a>
    <header className={`${s.header} ${scrolled ? s.headerScrolled : ''}`}>
      <Link href="#top" className={s.brand} aria-label="Sparki home"><span className={s.brandMark}>S</span>sparki</Link>
      <nav className={`${s.nav} ${menuOpen ? s.navOpen : ''}`} aria-label="Main navigation"><a href="#product" onClick={() => setMenuOpen(false)}>Product</a><a href="#solutions" onClick={() => setMenuOpen(false)}>Solutions</a><a href="#product" onClick={() => setMenuOpen(false)}>How it works</a></nav>
      <div className={s.headerActions}><Link href="/login" className={s.signIn}>Sign In</Link><a href="" onClick={(event) => event.preventDefault()} className={s.buttonSmall}>Book a Demo <Arrow /></a><button className={s.menuToggle} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? '×' : '☰'}</button></div>
    </header>
    <main id="main">
      <section className={s.hero} aria-labelledby="hero-heading"><div className={s.heroCopy}><p className={s.eyebrow}>The veterinary practice operating system</p><h1 id="hero-heading">Your clinic.<br /><span>Finally in sync.</span></h1><p className={s.lede}>Sparki brings scheduling, patients, clinical visits, inventory, and daily clinic operations into one connected veterinary workspace.</p><div className={s.actions}><a href="" onClick={(event) => event.preventDefault()} className={s.button}>Book a Demo <Arrow /></a><a href="#product" className={s.textLink}>Explore Sparki <span>↓</span></a></div></div><div className={s.heroProduct} aria-label="Sparki product preview"><div className={s.preview}><SparkiCanvas scene="dashboard" role="veterinarian" journey={journey(0)} className={s.canvas} /></div><div className={s.productContext}><span className={s.contextDot} />Today at a glance <strong>Appointments · Patients · Clinic flow</strong><small>Illustrative product preview</small></div></div></section>
      <div className={s.continuity}><p>Less chasing. More caring.</p><span>Patient context, always close</span><span>Clear ownership at each handoff</span><span>One connected clinic day</span></div>
      <section className={s.flow} id="product" aria-labelledby="flow-heading"><div className={s.flowSticky}><div className={s.flowCopy}><p className={s.eyebrow}>The patient journey</p><h2 id="flow-heading">Every patient.<br /><span>A clear next step.</span></h2><p className={s.body}>One connected visit from appointment to the final record. The right person sees what needs to happen next.</p><p className={s.flowHint}>Explore a visit, step by step ↓</p><div className={s.stepList} aria-label="Patient flow">{STEPS.map((item, index) => <button key={item.name} type="button" aria-pressed={index === step} onClick={() => setStep(index)}><span>{String(index + 1).padStart(2, '0')}</span>{item.name}</button>)}</div></div><div className={s.flowProduct}><div className={s.preview}><SparkiCanvas scene="today" role="veterinarian" journey={current} className={s.canvas} /></div><div className={s.flowCaption} key={step} aria-live="polite"><span>{current.label}</span><strong>{current.action}</strong><small>{current.detail}</small><p>{current.note}</p><small>Next with: {current.owner}</small></div></div></div></section>
      <section className={s.solutions} id="solutions" aria-labelledby="solutions-heading"><div className={s.sectionIntro}><p className={s.eyebrow}>One connected workspace</p><h2 id="solutions-heading">One system.<br /><span>Every part of the clinic.</span></h2><p className={s.body}>Sparki keeps the clinic’s major workflows connected without asking your team to carry the gaps.</p></div><div className={s.areaGrid}>{AREAS.map(([name, copy, detail], index) => <div className={s.area} key={name}><span className={s.areaNumber}>0{index + 1}</span><h3>{name}</h3><p>{copy}</p><div className={s.areaDetail}>{detail}</div></div>)}</div></section>
      <section className={s.finalCta} id="demo"><p className={s.eyebrow}>See Sparki in your clinic</p><h2>Give your clinic<br /><span>a better operating system.</span></h2><p>See how Sparki keeps your patients, people, and daily work connected.</p><a href="" onClick={(event) => event.preventDefault()} className={s.button}>Book a Demo <Arrow /></a></section>
    </main>
    <footer className={s.footer}><Link href="#top" className={s.brand}><span className={s.brandMark}>S</span>sparki</Link><span>Built for the people who care.</span><div><Link href="#product">Product</Link><Link href="/login">Sign In <Arrow /></Link><span>© {new Date().getFullYear()} Sparki</span></div></footer>
  </div>;
}
