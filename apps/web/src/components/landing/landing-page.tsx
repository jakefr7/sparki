'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import s from './landing.module.css';
import { LandingImage } from './landing-image';
import {
  clamp,
  tween,
  useAmbientDrift,
  usePointerDepth,
  useReducedMotion,
  useScrollRail,
} from './landing-motion';
import {
  SparkiCanvas,
  type SparkiJourney,
  type SparkiRole,
  type SparkiScene,
} from './sparki-surfaces';

const DEMO_URL = '/demo';

/** Seven states of one visit — reused verbatim by the canvas's Today scene. */
const STEPS: ReadonlyArray<Omit<SparkiJourney, 'step'> & { name: string; title: string; description: string }> = [
  {
    name: 'Schedule',
    title: 'A good visit starts before arrival.',
    description:
      'Appointments, patient context, and the day ahead — reception opens the day already in sync.',
    owner: 'Receptionist',
    action: 'Appointment scheduled',
    detail: 'Wellness exam · 9:30 AM',
    label: 'Scheduled',
    tone: 'accent',
    note: 'Patient history stays connected to the appointment.',
  },
  {
    name: 'Check In',
    title: 'A warm welcome. A clear handoff.',
    description: 'Know who has arrived and who needs attention. The clinical team sees Maple is ready.',
    owner: 'Receptionist',
    action: 'Checked in',
    detail: 'Arrived · Waiting for intake',
    label: 'Waiting',
    tone: 'waiting',
    note: 'The clinical team can see that Maple is ready.',
  },
  {
    name: 'Begin Intake',
    title: 'The whole picture, from the start.',
    description:
      'Capture the reason for the visit, observations, and vitals with the patient always in view.',
    owner: 'Technician',
    action: 'Intake in progress',
    detail: 'Room 2 · Vitals recorded',
    label: 'In Intake',
    tone: 'active',
    note: 'Technician observations retain their source.',
  },
  {
    name: 'Exam',
    title: 'More context. More room for care.',
    description:
      'Move from intake to exam and care planning with history, findings, and the next decision together.',
    owner: 'Veterinarian',
    action: 'Exam in progress',
    detail: 'Room 2 · Dr. Reyes',
    label: 'In Exam',
    tone: 'exam',
    note: 'Exam → Plan → Client decision',
  },
  {
    name: 'Care',
    title: 'A plan the team can act on.',
    description:
      'Carry authorized care into treatment. Performed care, medications, and inventory stay connected.',
    owner: 'Technician',
    action: 'Authorized care',
    detail: 'Care plan · Ready for the team',
    label: 'In Care',
    tone: 'active',
    note: 'Client decisions stay attached to each care item.',
  },
  {
    name: 'Discharge',
    title: 'Send them home with clarity.',
    description: 'Prepare instructions and follow-up, then hand off to reception for checkout.',
    owner: 'Receptionist',
    action: 'Ready for Checkout',
    detail: 'Discharge instructions prepared',
    label: 'Checkout',
    tone: 'checkout',
    note: 'Patient departure and record finalization stay distinct.',
  },
  {
    name: 'Record',
    title: 'The visit ends. The story stays.',
    description:
      'Review and finalize the clinical record. Find the visit again in the patient’s Medical History.',
    owner: 'Veterinarian',
    action: 'Record review',
    detail: 'SOAP · Ready for final review',
    label: 'Completed',
    tone: 'completed',
    note: 'Finalized records preserve attribution and amendments.',
  },
];

const ROLES: ReadonlyArray<{
  name: string;
  role: SparkiRole;
  heading: string;
  copy: string;
  label: string;
  rows: ReadonlyArray<[string, string, string]>;
  footer: string;
}> = [
  {
    name: 'Receptionist',
    role: 'receptionist',
    heading: 'Start every visit on the right foot.',
    copy: 'See the schedule, welcome arrivals, and keep the next handoff moving.',
    label: 'Your front desk, in focus',
    rows: [
      ['Maple', 'Wellness exam', 'Ready for intake'],
      ['Oliver', 'Follow-up', 'Arriving at 10:00'],
      ['Luna', 'Annual visit', 'Ready for Checkout'],
    ],
    footer: 'Appointments, arrivals, and patient context.',
  },
  {
    name: 'Technician',
    role: 'technician',
    heading: 'Know who’s ready. Know what’s next.',
    copy: 'Move from intake to authorized care with observations and patient context close at hand.',
    label: 'Your clinical queue',
    rows: [
      ['Maple', 'Room 2', 'Begin Intake'],
      ['Oliver', 'Room 1', 'Authorized care'],
      ['Luna', 'Room 3', 'Prepare discharge'],
    ],
    footer: 'Intake, vitals, care, and the next handoff.',
  },
  {
    name: 'Veterinarian',
    role: 'veterinarian',
    heading: 'Keep your attention on the patient.',
    copy: 'Bring history, exam findings, care decisions, and records into one clinical canvas.',
    label: 'Your patients, in view',
    rows: [
      ['Maple', 'Intake complete', 'Ready for exam'],
      ['Oliver', 'Exam complete', 'Review care plan'],
      ['Luna', 'Checked out', 'Record to finish'],
    ],
    footer: 'Exam, care planning, and records to finish.',
  },
  {
    name: 'Practice Manager',
    role: 'manager',
    heading: 'See the day beyond the schedule.',
    copy: 'Stay close to clinic flow, team responsibilities, and inventory that needs attention.',
    label: 'Your practice overview',
    rows: [
      ['Patient flow', 'Across the clinic', 'View handoffs'],
      ['Inventory', 'Stock and usage', 'Review exceptions'],
      ['Team tasks', 'Assigned work', 'See what’s next'],
    ],
    footer: 'Operations, inventory, and team visibility.',
  },
];

const CAPABILITIES: ReadonlyArray<[string, string, SparkiScene]> = [
  ['Scheduling', 'A clear view of the day ahead.', 'scheduler'],
  ['Clients & Patients', 'The context behind every visit.', 'patient'],
  ['Clinical Visits', 'From first observations to the final record.', 'patient'],
  ['Team Messaging', 'Keep the conversation close to the work.', 'messages'],
  ['Inventory', 'Connect supplies to the care you deliver.', 'inventory'],
  ['Tasks & Operations', 'Give the next step a clear owner.', 'dashboard'],
];

const ACT_NAMES = ['hero', 'converge', 'story', 'platform', 'roles', 'belief'] as const;
type Act = (typeof ACT_NAMES)[number];

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

function journeyFromStep(step: number): SparkiJourney {
  const source = STEPS[step] ?? STEPS[3]!;
  return {
    step,
    label: source.label,
    action: source.action,
    detail: source.detail,
    tone: source.tone,
    note: source.note,
    owner: source.owner,
  };
}

export function LandingPage() {
  const reduced = useReducedMotion();
  const motionOn = !reduced;

  const rootRef = useRef<HTMLDivElement>(null);
  const filmRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const convergeRef = useRef<HTMLElement>(null);
  const storyRef = useRef<HTMLElement>(null);
  const platformRef = useRef<HTMLElement>(null);
  const rolesRef = useRef<HTMLElement>(null);
  const beliefRef = useRef<HTMLElement>(null);

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [act, setAct] = useState<Act>('hero');
  const [step, setStep] = useState(0);
  const [role, setRole] = useState(0);
  const [capability, setCapability] = useState(0);
  const [ready, setReady] = useState(false);

  // Marks the client tree as interactive once hydrated.
  useEffect(() => setReady(true), []);

  // Header compaction + which act owns the viewport. The active act is the
  // section whose band crosses the viewport's vertical centre, so the deep-teal
  // ground, the canvas pose, the on-stage portraits and the canvas scene all
  // switch on the same frame the section does — no drifting between them.
  useEffect(() => {
    if (!motionOn) return;
    const els = [heroRef, convergeRef, storyRef, platformRef, rolesRef, beliefRef];
    let frame = 0;
    const measure = () => {
      frame = 0;
      setScrolled(window.scrollY > 24);
      const mid = window.innerHeight * 0.42;
      let next = 0;
      for (let i = 0; i < els.length; i += 1) {
        const el = els[i]!.current;
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= mid && rect.bottom >= mid) {
          next = i;
          break;
        }
        if (rect.top <= mid) next = i;
      }
      setAct(ACT_NAMES[next]!);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [motionOn]);

  // Reduced motion still needs the shrunk-header treatment.
  useEffect(() => {
    if (motionOn) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [motionOn]);

  // Story sub-rail — quantised to the 7 visit states. Kept as its own element
  // with the historical progress math so scroll position maps to a known step.
  useScrollRail(storyRef, {
    enabled: motionOn,
    steps: STEPS.length,
    onStep: (index) => setStep(clamp(index, 0, STEPS.length - 1)),
  });

  useScrollRail(platformRef, {
    enabled: motionOn,
    steps: CAPABILITIES.length,
    onStep: (index) => setCapability(clamp(index, 0, CAPABILITIES.length - 1)),
  });

  useScrollRail(rolesRef, {
    enabled: motionOn,
    steps: ROLES.length,
    onStep: (index) => setRole(clamp(index, 0, ROLES.length - 1)),
  });

  usePointerDepth(stageRef, { enabled: motionOn });
  useAmbientDrift(canvasRef, { enabled: motionOn });

  // A control press seeks the page to that beat instead of the visitor
  // scrubbing there — smooth, eased, and it still lands on the real anchor.
  const seekTo = useCallback(
    (element: HTMLElement | null, fraction: number) => {
      if (!element) return;
      const target =
        window.scrollY +
        element.getBoundingClientRect().top +
        (element.offsetHeight - window.innerHeight) * clamp(fraction, 0, 0.999);
      if (reduced) {
        window.scrollTo(0, target);
        return;
      }
      tween(window.scrollY, target, 620, (value) => window.scrollTo(0, value));
    },
    [reduced],
  );

  const chooseStep = (index: number) => {
    setStep(index);
    seekTo(storyRef.current, (index + 0.5) / STEPS.length);
  };
  const chooseRole = (index: number) => {
    setRole(index);
    seekTo(rolesRef.current, (index + 0.5) / ROLES.length);
  };
  const chooseCapability = (index: number) => {
    setCapability(index);
    seekTo(platformRef.current, (index + 0.5) / CAPABILITIES.length);
  };

  const currentStep = STEPS[step] ?? STEPS[3]!;
  const activeRole = ROLES[role] ?? ROLES[2]!;
  const activeCapability = CAPABILITIES[capability] ?? CAPABILITIES[0]!;

  // What the persistent canvas is showing right now.
  const canvasScene: SparkiScene =
    act === 'story'
      ? 'today'
      : act === 'platform'
        ? activeCapability[2]
        : act === 'roles'
          ? role === 3
            ? 'dashboard'
            : 'today'
          : act === 'belief'
            ? 'patient'
            : 'dashboard';
  const canvasRole: SparkiRole = act === 'roles' ? activeRole.role : 'veterinarian';
  const canvasJourney = journeyFromStep(step);
  const isDark = act === 'story' || act === 'roles' || act === 'belief';

  const canvas = (
    <SparkiCanvas
      innerRef={canvasRef}
      scene={canvasScene}
      role={canvasRole}
      journey={canvasJourney}
      className={s.canvas}
    />
  );

  return (
    <div
      id="top"
      ref={rootRef}
      className={s.landing}
      data-reduced={reduced ? 'true' : undefined}
      data-ready={ready ? 'true' : undefined}
    >
      <Link href="#main" className={s.skip}>
        Skip to content
      </Link>

      <header className={`${s.header} ${scrolled ? s.headerScrolled : ''}`}>
        <Link href="#top" className={s.brand} aria-label="Sparki home">
          <span className={s.brandMark} aria-hidden="true">
            S
          </span>
          sparki
        </Link>
        <nav aria-label="Main navigation" className={`${s.nav} ${menuOpen ? s.navOpen : ''}`}>
          <Link href="#product" onClick={() => setMenuOpen(false)}>
            Product
          </Link>
          <Link href="#solutions" onClick={() => setMenuOpen(false)}>
            Solutions
          </Link>
          <Link href="#why-sparki" onClick={() => setMenuOpen(false)}>
            Why Sparki
          </Link>
        </nav>
        <div className={s.headerActions}>
          <Link href="/login" className={s.signIn}>
            Sign In
          </Link>
          <Link className={s.buttonSmall} href={DEMO_URL}>
            Book a Demo <Arrow />
          </Link>
          <button
            className={s.menuToggle}
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? '×' : '☰'}
          </button>
        </div>
      </header>

      <main id="main">
        {/* The film: one persistent product canvas, re-posed as acts scroll past. */}
        <div ref={filmRef} className={s.film}>
          {motionOn && (
            <div
              ref={stageRef}
              className={s.stage}
              data-act={act}
              style={{ ['--stage-dark' as string]: isDark ? 1 : 0 }}
              aria-hidden="true"
            >
              <div className={s.stageGround} />
              <LandingImage slot="hero" className={s.figHero} priority />
              <LandingImage slot="flow" className={s.figFlow} />
              <LandingImage slot="belief" className={s.figBelief} />
              <div className={s.canvasHolder}>{canvas}</div>
            </div>
          )}

          {/* ACT — hero */}
          <section ref={heroRef} className={`${s.act} ${s.actHero}`}>
            <div className={s.actInner}>
              <p className={s.eyebrow}>
                <span /> THE VETERINARY PRACTICE OPERATING SYSTEM
              </p>
              <h1>
                Your clinic.
                <br />
                <span>Finally in sync.</span>
              </h1>
              <p className={s.lede}>
                Patients, people, and everything in between.
                <br className={s.desktopBreak} /> One beautifully connected veterinary workspace.
              </p>
              <div className={s.actActions}>
                <Link className={s.button} href={DEMO_URL}>
                  Book a Demo <Arrow />
                </Link>
                <Link className={s.textLink} href="#product">
                  Explore Sparki <span aria-hidden="true">↓</span>
                </Link>
              </div>
              {reduced && (
                <div className={s.inlineCanvas}>
                  {canvas}
                  <p className={s.inlineNote}>
                    <span aria-hidden="true">✓</span> Maple is ready for the veterinarian — the
                    whole team can see the next step.
                  </p>
                </div>
              )}
            </div>
            <p className={s.scrollCue} aria-hidden="true">
              <span>Scroll to see a visit move through Sparki</span> ↓
            </p>
          </section>

          {/* ACT — convergence */}
          <section ref={convergeRef} className={`${s.act} ${s.actConverge}`} id="product">
            <div className={s.actText}>
              <p className={s.eyebrow}>From fragmented to focused</p>
              <h2>
                One clinic shouldn’t need
                <br />
                <span>six disconnected systems.</span>
              </h2>
              <p className={s.body}>
                When the tools don’t talk, your team fills the gaps — re-typing, re-checking,
                carrying context between screens. Sparki brings the work back into one place, with
                the patient at the center.
              </p>
              <ul className={s.fragmentList}>
                {CAPABILITIES.map(([name]) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          </section>

          {/* ACT — story / patient journey */}
          <section
            ref={storyRef}
            className={`${s.act} ${s.actStory}`}
            data-dark={act === 'story' ? 'true' : undefined}
            aria-labelledby="journey-heading"
          >
            <div className={s.actText}>
              <p className={s.eyebrow}>One patient. One connected journey.</p>
              <h2 id="journey-heading">
                A clear next step.
                <br />
                <span>At every step.</span>
              </h2>
              <div className={s.storyCopy} key={step}>
                <span className={s.stepNumber}>
                  0{step + 1} <span>/ 07</span>
                </span>
                <h3>{currentStep.title}</h3>
                <p>{currentStep.description}</p>
                <span className={s.owner}>
                  IN FOCUS <b>{currentStep.owner}</b>
                </span>
              </div>
              <div className={s.journeyState} key={`state-${step}`}>
                <span className={s.tealPill}>{currentStep.name}</span>
                <h3>{currentStep.action}</h3>
                <p>{currentStep.detail}</p>
                <div className={s.journeyNote}>
                  <span aria-hidden="true">↳</span>
                  {currentStep.note}
                </div>
              </div>
              <div className={s.stepNav} aria-label="Explore the patient journey">
                {STEPS.map((item, i) => (
                  <button
                    key={item.name}
                    type="button"
                    aria-pressed={step === i}
                    onClick={() => chooseStep(i)}
                  >
                    <span>{i < step ? '✓' : `0${i + 1}`}</span>
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* ACT — platform */}
          <section ref={platformRef} className={`${s.act} ${s.actPlatform}`} id="solutions">
            <div className={s.actText}>
              <p className={s.eyebrow}>Connected by design</p>
              <h2>
                One system.
                <br />
                <span>Every part of the clinic.</span>
              </h2>
              <p className={s.body}>A change of task shouldn’t mean a loss of context.</p>
              <div className={s.capabilityList}>
                {CAPABILITIES.map(([name, description], i) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={capability === i}
                    onClick={() => chooseCapability(i)}
                  >
                    <span className={s.capabilityNumber}>0{i + 1}</span>
                    <span>
                      <strong>{name}</strong>
                      <small>{description}</small>
                    </span>
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
              {reduced && (
                <div className={s.inlineCanvas}>
                  <div className={s.connectedPanel} key={capability}>
                    <span className={s.eyebrow}>Connected workspace</span>
                    <h3>{activeCapability[0]}</h3>
                    <p>{activeCapability[1]}</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ACT — roles */}
          <section ref={rolesRef} className={`${s.act} ${s.actRoles}`} data-dark={act === 'roles' ? 'true' : undefined}>
            <div className={s.actText}>
              <p className={s.eyebrow}>Your team. Their point of view.</p>
              <h2>
                Different roles.
                <br />
                <span>The same shared picture.</span>
              </h2>
              <div className={s.roleTabs} aria-label="Choose a clinic role">
                {ROLES.map((item, i) => (
                  <button
                    key={item.name}
                    type="button"
                    aria-pressed={role === i}
                    onClick={() => chooseRole(i)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
              <div className={s.roleCopy} key={role}>
                <span className={s.eyebrow}>{activeRole.name}</span>
                <h3>{activeRole.heading}</h3>
                <p>{activeRole.copy}</p>
                <Link href={DEMO_URL} className={s.textLink}>
                  See Sparki for your team <Arrow />
                </Link>
              </div>
              {reduced && (
                <div className={s.inlineCanvas}>
                  <div className={s.rolePreview} key={role}>
                    <div className={s.rolePreviewHead}>
                      <h4>{activeRole.label}</h4>
                    </div>
                    {activeRole.rows.map(([name, detail, status]) => (
                      <div className={s.roleRow} key={name}>
                        <span className={s.roleDot} />
                        <div>
                          <strong>{name}</strong>
                          <small>{detail}</small>
                        </div>
                        <span>{status}</span>
                      </div>
                    ))}
                    <p>{activeRole.footer}</p>
                  </div>
                </div>
              )}
              {!reduced && (
                <p className={s.rolePreviewCaption}>
                  <span className={s.roleDot} /> {activeRole.label} — {activeRole.footer}
                </p>
              )}
            </div>
          </section>

          {/* ACT — belief */}
          <section ref={beliefRef} className={`${s.act} ${s.actBelief}`} data-dark={act === 'belief' ? 'true' : undefined} id="why-sparki">
            <div className={s.actText}>
              <p className={s.eyebrow}>Built around the work</p>
              <h2>
                Built for how clinics
                <br />
                <span>actually work.</span>
              </h2>
              <p className={s.body}>
                The interruptions. The handoffs. The patient who needs a little more time. Sparki
                is designed around the way veterinary teams actually work — so software carries the
                context, and people carry the care.
              </p>
              <div className={s.beliefSignature}>
                <span className={s.brandMark} aria-hidden="true">
                  S
                </span>
                <span>More care. Less carrying the software.</span>
              </div>
            </div>
            {reduced && <LandingImage slot="belief" className={s.figBeliefInline} />}
          </section>
        </div>

        {/* Final CTA — outside the film. */}
        <section className={s.finalCta} id="demo">
          <div className={s.finalGlow} aria-hidden="true" />
          <div className={s.finalInner}>
            <p className={s.eyebrow}>A better day starts here</p>
            <h2>
              Give your clinic
              <br />
              <span>a better operating system.</span>
            </h2>
            <p>
              See what veterinary work feels like
              <br />
              when everything finally works together.
            </p>
            <Link className={s.button} href={DEMO_URL}>
              Book a Demo <Arrow />
            </Link>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <Link href="#top" className={s.brand}>
          <span className={s.brandMark} aria-hidden="true">
            S
          </span>
          sparki
        </Link>
        <span>Built for the people who care.</span>
        <div>
          <Link href="#product">Product</Link>
          <Link href="/login">
            Sign In <Arrow />
          </Link>
          <span>© {new Date().getFullYear()} Sparki</span>
        </div>
      </footer>
    </div>
  );
}
