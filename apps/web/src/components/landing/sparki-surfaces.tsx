import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode, Ref } from 'react';

import s from './sparki-surfaces.module.css';
import { useReducedMotion } from './landing-motion';
import { SparkiLogo } from '../sparki-logo';

/**
 * Marketing renditions of the real Sparki app surfaces — same navigation,
 * type ramp, `.home-widget` cards, status tones (`#b8872a` waiting, `#1f8a8a`
 * exam, `#2c6f9f` active, `#7a5aa6` checkout, `#2b8a5d` completed), scheduler
 * grid, inventory table and team-messages layout as apps/web/src/app/globals.css,
 * simplified for presentation. Illustrative only: no real patient data, not an
 * interactive clinical workflow.
 *
 * One `<SparkiCanvas>` instance is mounted for the whole landing page and
 * re-posed as the visitor scrolls — the scenes cross-fade inside a persistent
 * shell instead of each section swapping in an unrelated mockup.
 */

export type SparkiScene =
  | 'dashboard'
  | 'today'
  | 'scheduler'
  | 'patient'
  | 'billing'
  | 'inventory'
  | 'messages';

export type SparkiRole = 'receptionist' | 'technician' | 'veterinarian' | 'manager';

export interface SparkiJourney {
  step: number;
  label: string;
  action: string;
  detail: string;
  tone: string;
  note: string;
  owner: string;
}

const NAV: ReadonlyArray<{ label: string; scene?: SparkiScene; muted?: boolean; d: string }> = [
  { label: 'Dashboard', scene: 'dashboard', d: 'M3 10.5 12 4l9 6.5M5 9.5V20h14V9.5' },
  { label: 'Today', scene: 'today', d: 'M4 8h16M4 8v11h16V8M4 8l1-3h14l1 3M9 12h6' },
  { label: 'Scheduler', scene: 'scheduler', d: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
  { label: 'Patients / Clients', scene: 'patient', d: 'M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM5 20c0-3.5 3-6 7-6s7 2.5 7 6' },
  { label: 'Client Communication', d: 'M4 6h16v10H4zM4 6l8 6 8-6' },
  { label: 'Tasks', muted: true, d: 'M5 12l4 4 10-10' },
  { label: 'Reports', muted: true, d: 'M5 20V8m5 12V4m5 16v-7m5 7V10' },
  { label: 'Inventory', scene: 'inventory', d: 'M4 7l8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M12 11v10' },
  { label: 'Billing', scene: 'billing', d: 'M3 7h18v10H3zM3 11h18M7 15h4' },
  { label: 'Settings', muted: true, d: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 12h2m12 0h2M12 4v2m0 12v2' },
  { label: 'Help', muted: true, d: 'M9 9a3 3 0 1 1 4 2.8c-1 .6-1 .9-1 2.2M12 17h.01' },
];

const SCENE_NAV: Record<SparkiScene, string> = {
  dashboard: 'Dashboard',
  today: 'Today',
  scheduler: 'Scheduler',
  patient: 'Patients / Clients',
  billing: 'Billing',
  inventory: 'Inventory',
  messages: 'Team Messages',
};

const TOPBAR: Record<SparkiScene, { eyebrow: string; title: string; subtitle: string }> = {
  dashboard: {
    eyebrow: 'Operations',
    title: 'Command Center',
    subtitle: "Here's what's happening at Sparki Clinic today.",
  },
  today: {
    eyebrow: 'Today',
    title: "Today's Schedule",
    subtitle: 'Appointments and patient flow for today.',
  },
  scheduler: {
    eyebrow: 'Scheduling',
    title: 'Scheduler',
    subtitle: 'Appointments, providers, and room flow for the week.',
  },
  patient: {
    eyebrow: 'Clinical visit',
    title: 'Maple Reyes',
    subtitle: 'Exam in progress · Room 2 · Dr. Reyes',
  },
  billing: {
    eyebrow: 'Checkout',
    title: 'Checkout',
    subtitle: 'Review charges, collect payment, and prepare discharge.',
  },
  inventory: {
    eyebrow: 'Operations',
    title: 'Inventory',
    subtitle: 'Stock, purchasing, usage, counts, and compliance records.',
  },
  messages: {
    eyebrow: 'Internal collaboration',
    title: 'Team Messages',
    subtitle: 'Coordinate handoffs, channels, and clinic work with your team.',
  },
};

const ROLE_USER: Record<SparkiRole, { name: string; label: string; initials: string }> = {
  receptionist: { name: 'Jordan Ellis', label: 'Receptionist', initials: 'JE' },
  technician: { name: 'Sam Rivera', label: 'Technician', initials: 'SR' },
  veterinarian: { name: 'Dr. Alex Reyes', label: 'Veterinarian', initials: 'AR' },
  manager: { name: 'Priya Shah', label: 'Practice Manager', initials: 'PS' },
};

function Dog() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 10C24 10 18 13 18 18 10 18 4 24 6 32 7 38 12 42 18 38 17 44 19 49 24 51 27 53 37 53 40 51 45 49 47 44 46 38 52 42 57 38 58 32 60 24 54 18 46 18 46 13 40 10 32 10Z" />
    </svg>
  );
}
function Cat() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M16 24 12 6l17 12h6l17-12-4 18a17 17 0 0 1 4 11c0 11-9.4 19-20 19s-20-8-20-19a17 17 0 0 1 4-11Z" />
    </svg>
  );
}

function Card({
  title,
  meta,
  link,
  children,
  className,
}: {
  title: string;
  meta?: string | undefined;
  link?: string | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <section className={className ? `${s.card} ${className}` : s.card}>
      <div className={s.cardHead}>
        <div>
          <p className={s.cardTitle}>{title}</p>
          {meta ? <p className={s.cardMeta}>{meta}</p> : null}
        </div>
        {link ? <span className={s.cardLink}>{link} ↗</span> : null}
      </div>
      {children}
    </section>
  );
}

const DASH_ROWS: Array<[string, string, string, string, 'dog' | 'cat']> = [
  ['9:30', 'Maple Reyes', 'Wellness exam', 'Ready for Doctor', 'dog'],
  ['9:45', 'Oliver Tran', 'Recheck · derm', 'In Intake', 'cat'],
  ['10:15', 'Luna Park', 'Vaccines + nails', 'Waiting', 'dog'],
  ['10:30', 'Biscuit Alvarez', 'Dental consult', 'Scheduled', 'dog'],
];

function DashboardScene({
  role,
  active,
  liveTick,
}: {
  role: SparkiRole;
  active: boolean;
  liveTick: number;
}) {
  const user = ROLE_USER[role];
  const first = user.name.replace(/^Dr\.\s*/, '').split(' ')[0];
  return (
    <div className={s.scene} data-scene="dashboard" data-active={active || undefined}>
      <p className={s.greeting}>
        Good morning, {first}! 👋 <span>{TOPBAR.dashboard.subtitle}</span>
      </p>
      <div className={s.metrics}>
        {(
          [
            ['Scheduled Today', '24', undefined],
            ['Waiting / Arrived', '3', 'waiting'],
            ['Longest Wait', '12 min', 'waiting'],
            ['Active Visits', '5', 'active'],
            ['Checkout Ready', '2', 'checkout'],
            ['Completed Today', '11', 'completed'],
          ] as Array<[string, string, string | undefined]>
        ).map(([label, value, tone]) => (
          <div key={label} className={s.metric} data-tone={tone}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className={s.dashGrid}>
        <Card title="Appointment Queue" meta="Next arrivals and where they are" link="Open">
          <div className={s.rowList}>
            {DASH_ROWS.map(([time, name, reason, status, kind], i) => (
              <div
                key={name}
                className={s.row}
                data-active={i === 0}
              >
                {i === 0 && active && liveTick > 0 ? (
                  <span key={liveTick} className={s.pulseSweep} aria-hidden="true" />
                ) : null}
                <span className={s.rowTime}>{time}</span>
                <span className={s.avatar}>{kind === 'cat' ? <Cat /> : <Dog />}</span>
                <span className={s.rowMain}>
                  <strong>{name}</strong>
                  <span>{reason}</span>
                </span>
                <span
                  className={s.pill}
                  data-tone={
                    status === 'Ready for Doctor'
                      ? 'exam'
                      : status === 'In Intake'
                        ? 'active'
                        : status === 'Waiting'
                          ? 'waiting'
                          : 'accent'
                  }
                >
                  {status}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Currently in Clinic" meta="Patients physically here now">
          <div className={s.rowList}>
            {[
              ['Maple Reyes', 'Room 2 · Dr. Reyes', 'exam'],
              ['Pepper Doyle', 'Room 1 · treatment', 'active'],
              ['Willow Kim', 'Reception · checkout', 'checkout'],
            ].map(([name, where, tone]) => (
              <div key={name} className={s.row}>
                <span className={s.avatar}>
                  <Dog />
                </span>
                <span className={s.rowMain}>
                  <strong>{name}</strong>
                  <span>{where}</span>
                </span>
                <span className={s.pill} data-tone={tone} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// Which status group Maple truthfully belongs to while she's still ahead of
// the exam room — checked in and intake both happen in/around the waiting
// area, so she only moves groups once a veterinarian is ready for her.
const GROUP_FOR_TONE: Record<string, number> = { waiting: 0, active: 0, exam: 1 };

function TodayScene({ journey, active }: { journey: SparkiJourney; active: boolean }) {
  const mapleGroup = GROUP_FOR_TONE[journey.tone] ?? 1;
  // The Sparki Pulse marks the one real handoff in this scene: Maple leaving
  // the waiting area once a veterinarian is ready for her.
  const isHandoff = journey.step === 3;
  const groups: Array<[string, string, Array<[string, string, string, string, string]>]> = [
    ['Waiting', 'var(--sk-waiting)', [['9:15', 'Luna Park', 'Vaccines + nails', 'Room 3', 'Tech: Sam']]],
    ['In Exam', 'var(--sk-exam)', [['9:00', 'Oliver Tran', 'Derm recheck', 'Room 1', 'Dr. Okafor']]],
    ['Checkout', 'var(--sk-checkout)', [['8:30', 'Willow Kim', 'Senior panel', 'Reception', 'Front desk']]],
  ];
  return (
    <div className={s.scene} data-scene="today" data-active={active || undefined}>
      <div className={s.todayGrid}>
        <Card title="Today's Patient Flow" meta="Appointments & active visits" link="All statuses">
          {groups.map(([group, dot, rows], groupIndex) => {
            const hasMaple = groupIndex === mapleGroup;
            return (
              <div key={group} className={s.statusGroup} style={{ ['--dot' as string]: dot }}>
                <div className={s.statusGroupHead}>
                  <i />
                  <span className={s.groupName}>{group}</span>
                  <strong>{rows.length + (hasMaple ? 1 : 0)}</strong>
                </div>
                {hasMaple ? (
                  <div
                    key={`maple-${journey.step}`}
                    className={isHandoff ? `${s.todayRow} ${s.pulse}` : s.todayRow}
                    data-active="true"
                  >
                    <span className={s.rowTime}>9:05</span>
                    <span className={s.miniCell}>
                      <span className={s.avatar}>
                        <Dog />
                      </span>
                      <span>
                        <strong>Maple Reyes</strong>
                        <span>Wellness exam</span>
                      </span>
                    </span>
                    <span className={s.todayRowMeta}>Room 2</span>
                    <span className={s.pill} data-tone={journey.tone}>
                      {journey.label}
                    </span>
                  </div>
                ) : null}
                {rows.map(([time, name, reason, room, who]) => (
                  <div key={name} className={s.todayRow}>
                    <span className={s.rowTime}>{time}</span>
                    <span className={s.miniCell}>
                      <span className={s.avatar}>{name === 'Oliver Tran' ? <Cat /> : <Dog />}</span>
                      <span>
                        <strong>{name}</strong>
                        <span>{reason}</span>
                      </span>
                    </span>
                    <span className={s.todayRowMeta}>{room}</span>
                    <span className={s.pill} data-tone="exam">
                      {who}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </Card>
        <div className={s.rail}>
          <Card title="Maple Reyes" meta="Golden Retriever · Wellness exam">
            <div className={s.rowList}>
              <div className={s.planLine}>
                <span>Stage</span>
                <b>{journey.action}</b>
              </div>
              <div className={s.planLine}>
                <span>Detail</span>
                <b>{journey.detail}</b>
              </div>
              <div className={s.planLine}>
                <span>In focus</span>
                <b>{journey.owner}</b>
              </div>
            </div>
            <div className={s.msgLinked} style={{ marginTop: 10 }}>
              ↳ <span>{journey.note}</span>
            </div>
          </Card>
          <Card title="Today Overview" meta="Dated today">
            <div className={s.overviewTotals}>
              <div>
                <strong>24</strong>
                <span>Scheduled</span>
              </div>
              <div>
                <strong>7</strong>
                <span>Visit records</span>
              </div>
              <div>
                <strong>4</strong>
                <span>In clinic</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

const APPTS: Array<[number, number, number, string]> = [
  // dayIndex, topPx, heightPx, accent tone var
  [0, 8, 52, 'var(--sk-exam)'],
  [0, 150, 78, 'var(--sk-active)'],
  [1, 66, 60, 'var(--sk-accent)'],
  [1, 210, 52, 'var(--sk-waiting)'],
  [2, 30, 90, 'var(--sk-active)'],
  [2, 190, 60, 'var(--sk-checkout)'],
  [3, 100, 70, 'var(--sk-exam)'],
  [4, 20, 54, 'var(--sk-accent)'],
  [4, 130, 96, 'var(--sk-active)'],
  [4, 250, 48, 'var(--sk-completed)'],
];
const APPT_TEXT: Array<[string, string, string]> = [
  ['Maple Reyes', 'Wellness · Dr. Reyes', 'Confirmed'],
  ['Pepper Doyle', 'Dental · Dr. Okafor', 'In progress'],
  ['Kobe Nash', 'Lameness · Dr. Reyes', 'Confirmed'],
  ['Luna Park', 'Vaccines · Tech', 'Arrived'],
  ['Juno Bell', 'Ultrasound · Dr. Okafor', 'In progress'],
  ['Willow Kim', 'Senior panel · Dr. Reyes', 'Checkout'],
  ['Oliver Tran', 'Derm recheck · Dr. Okafor', 'Checked in'],
  ['Suki Lam', 'Nail trim · Tech', 'Confirmed'],
  ['Bodhi Cruz', 'Mass removal · Dr. Reyes', 'In progress'],
  ['Fig Moreno', 'Recheck · Dr. Okafor', 'Complete'],
];

function SchedulerScene({ active }: { active: boolean }) {
  const days = [
    ['MON', '8'],
    ['TUE', '9', true],
    ['WED', '10'],
    ['THU', '11'],
    ['FRI', '12'],
  ] as Array<[string, string, boolean?]>;
  return (
    <div className={s.scene} data-scene="scheduler" data-active={active || undefined}>
      <div className={s.schedToolbar}>
        <div className={s.schedNav}>
          <span className={s.schedArrow}>‹</span>
          <strong>Sep 8 – 12, 2026</strong>
          <span className={s.schedArrow}>›</span>
        </div>
        <div className={s.schedMeta}>
          <span>Live · Updated 9:41</span>
          <span className={s.fakeSelect}>All providers ⌄</span>
          <span className={s.fakeSelect}>All statuses ⌄</span>
          <span className={s.schedToggle}>
            <span>Day</span>
            <span data-on="true">Week</span>
          </span>
        </div>
      </div>
      <div className={s.schedCal}>
        <div className={s.schedHead}>
          <div />
          {days.map(([name, num, today]) => (
            <div key={name} data-today={today ? 'true' : undefined}>
              <span>{name}</span>
              <strong>{num}</strong>
            </div>
          ))}
        </div>
        <div className={s.schedBody}>
          <div className={s.schedGutter}>
            {['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM'].map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          {[0, 1, 2, 3, 4].map((day) => (
            <div key={day} className={s.schedCol}>
              {APPTS.map(([d, top, height, accent], globalIndex) => {
                if (d !== day) return null;
                const [name, meta, status] = APPT_TEXT[globalIndex] ?? APPT_TEXT[0]!;
                return (
                  <div
                    key={globalIndex}
                    className={s.appt}
                    style={{ top, height, ['--accent' as string]: accent }}
                  >
                    <strong>{name}</strong>
                    <span>{meta}</span>
                    {height > 60 ? <small>{status}</small> : null}
                  </div>
                );
              })}
            </div>
          ))}
          <div className={s.schedNow} style={{ top: 176 }}>
            <span>9:41</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const STAGE_LABELS = ['Intake', 'Exam', 'Plan', 'Client decision', 'Checkout', 'Record'];

// The 8-step marketing journey and this workspace's own 6-stage visit
// stepper describe the same visit at different grain. Treatment stays in
// this same workspace (Sparki carries the visit forward rather than
// switching screens), and Record intentionally shows Checkout as already
// done — it happened in Billing, a different part of one connected system.
function stageForStep(step: number): number {
  if (step === 7) return 5; // Record
  if (step === 5) return 2; // Treatment -> Plan
  return 1; // Exam (and any other step reaching this scene) -> Exam
}

function PatientScene({ journey, active }: { journey: SparkiJourney; active: boolean }) {
  const focus: 'exam' | 'treatment' | 'record' =
    journey.step === 5 ? 'treatment' : journey.step === 7 ? 'record' : 'exam';
  const activeStage = stageForStep(journey.step);
  return (
    <div className={s.scene} data-scene="patient" data-active={active || undefined}>
      <div className={s.ctxBar}>
        <span className={s.avatar}>
          <Dog />
        </span>
        <span className={s.ctxBarMain}>
          <strong>Maple Reyes</strong>
          <span>Golden Retriever · F/S · 4 yr · 28.4 kg · Client: A. Reyes</span>
        </span>
        <span className={s.ctxBarTags}>
          <span className={s.tag}>Allergy: penicillin</span>
          <span className={s.tag} data-tone="info">
            Wellness plan
          </span>
        </span>
      </div>
      <div className={s.progress}>
        {STAGE_LABELS.map((stage, i) => (
          <i
            key={stage}
            data-state={i < activeStage ? 'done' : i === activeStage ? 'current' : undefined}
          >
            {stage}
          </i>
        ))}
        <u />
      </div>
      <div className={s.examGrid} data-focus={focus}>
        <Card title="Physical Exam" meta="By system · Dr. Reyes">
          <div className={s.vitals}>
            {[
              ['Temp', '101.2 °F'],
              ['Heart rate', '88 bpm'],
              ['Resp. rate', '20 rpm'],
              ['Weight', '28.4 kg'],
              ['BCS', '5 / 9'],
              ['Pain', '0 / 4'],
            ].map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <div className={s.systems}>
            {[
              ['General', false],
              ['Integument', true],
              ['Eyes / Ears', false],
              ['Oral', false],
              ['Cardiovascular', false],
              ['Respiratory', false],
              ['Abdomen', false],
              ['Musculoskeletal', false],
              ['Neuro', false],
              ['Lymph', false],
            ].map(([name, abn]) => (
              <span key={String(name)} className={s.system} data-flag={abn ? 'abn' : undefined}>
                {name}
              </span>
            ))}
          </div>
        </Card>
        <Card title="Plan & Estimate" className={s.planCard}>
          <p className={s.planHeading}>Authorized care</p>
          {[
            ['Wellness exam', '$68'],
            ['DHPP booster', '$32'],
            ['Ear cytology', '$45'],
            ['Otic medication', '$26'],
          ].map(([line, price]) => (
            <div key={line} className={s.planLine}>
              <span>{line}</span>
              <b>{price}</b>
            </div>
          ))}
          <div className={s.planTotal}>
            <span>Estimate</span>
            <span>$171</span>
          </div>
          <div className={s.msgLinked} style={{ marginTop: 10 }}>
            ↳ <span>{journey.note}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

const INVENTORY_ROWS: Array<[string, string, string, string, string, 'ok' | 'low' | 'reorder']> = [
  ['Cerenia 16 mg tablet', 'Pharmacy', '42', '38', '30', 'ok'],
  ['Gabapentin 100 mg cap', 'Pharmacy', '18', '12', '24', 'low'],
  ['Isoflurane 250 mL', 'Surgery', '3', '2', '4', 'reorder'],
  ['3-0 PDS suture', 'Surgery', '26', '26', '15', 'ok'],
  ['Feline FVRCP vaccine', 'Fridge A', '9', '6', '20', 'reorder'],
  ['Bravecto chew L', 'Retail', '31', '27', '18', 'ok'],
];

function InventoryScene({ active }: { active: boolean }) {
  return (
    <div className={s.scene} data-scene="inventory" data-active={active || undefined}>
      <div className={s.invTabs}>
        {['Stock', 'Purchasing', 'Usage', 'Counts', 'Compliance'].map((t, i) => (
          <span key={t} data-on={i === 0 ? 'true' : undefined}>
            {t}
          </span>
        ))}
      </div>
      <div className={s.invMetrics}>
        {[
          ['Items tracked', '486'],
          ['Below reorder', '7'],
          ['Expiring < 60d', '4'],
          ['On order', '12'],
        ].map(([k, v]) => (
          <div key={k}>
            <span>{k}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      <Card title="Stock on hand" meta="Main location · live counts" link="Adjust">
        <table className={s.invTable}>
          <thead>
            <tr>
              <th>Item</th>
              <th>Location</th>
              <th>On hand</th>
              <th>Available</th>
              <th>Reorder</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {INVENTORY_ROWS.map(([item, loc, onHand, avail, reorder, state]) => (
              <tr key={item}>
                <td>{item}</td>
                <td>{loc}</td>
                <td>{onHand}</td>
                <td>{avail}</td>
                <td>{reorder}</td>
                <td>
                  <span
                    className={s.invStatus}
                    data-state={state === 'ok' ? undefined : state}
                  >
                    {state === 'ok' ? 'In stock' : state === 'low' ? 'Low' : 'Reorder'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

const CHECKOUT_STAGES = ['Review', 'Payment', 'Done'];
const CHECKOUT_LINE_ITEMS: Array<[string, string]> = [
  ['Wellness exam', '$68'],
  ['DHPP booster', '$32'],
  ['Ear cytology', '$45'],
  ['Otic medication', '$26'],
];

function BillingScene({ journey, active }: { journey: SparkiJourney; active: boolean }) {
  return (
    <div className={s.scene} data-scene="billing" data-active={active || undefined}>
      <div className={s.ctxBar}>
        <span className={s.avatar}>
          <Dog />
        </span>
        <span className={s.ctxBarMain}>
          <strong>Maple Reyes</strong>
          <span>Wellness exam · Ready for checkout</span>
        </span>
      </div>
      <div className={s.progress}>
        {CHECKOUT_STAGES.map((stage, i) => (
          <i key={stage} data-state={i < 1 ? 'done' : i === 1 ? 'current' : undefined}>
            {stage}
          </i>
        ))}
        <u />
      </div>
      <div className={s.examGrid}>
        <Card title="Invoice" meta="Visit charges · Maple Reyes">
          <p className={s.planHeading}>Authorized care</p>
          {CHECKOUT_LINE_ITEMS.map(([line, price]) => (
            <div key={line} className={s.planLine}>
              <span>{line}</span>
              <b>{price}</b>
            </div>
          ))}
          <div className={s.planTotal}>
            <span>Total due</span>
            <span>$171</span>
          </div>
        </Card>
        <div className={s.rail}>
          <Card title="Payment" meta="Collected at checkout">
            <div className={s.rowList}>
              <div className={s.planLine}>
                <span>Method</span>
                <b>Card on file</b>
              </div>
              <div className={s.planLine}>
                <span>Status</span>
                <b>{journey.action}</b>
              </div>
            </div>
          </Card>
          <Card title="Discharge" meta="Before departure">
            <div className={s.msgLinked}>
              ↳ <span>{journey.detail}</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MessagesScene({ active }: { active: boolean }) {
  return (
    <div className={s.scene} data-scene="messages" data-active={active || undefined}>
      <div className={s.msgGrid}>
        <div className={s.msgNav}>
          <p className={s.msgNavTitle}>Team Messages</p>
          <p>Channels</p>
          {['front-desk', 'clinical-floor', 'inventory', 'surgery'].map((c, i) => (
            <div key={c} className={s.msgChan} data-active={i === 1 ? 'true' : undefined}>
              # {c}
            </div>
          ))}
          <p>Direct messages</p>
          {['Dr. Reyes', 'Sam Rivera', 'Priya Shah'].map((n) => (
            <div key={n} className={s.msgChan}>
              <i /> {n}
            </div>
          ))}
        </div>
        <div className={s.msgConv}>
          <div className={s.msgBanner}>
            <strong># clinical-floor</strong>
            <span>6 members · handoffs and floor coordination</span>
          </div>
          <div className={s.msgTimeline}>
            {[
              ['SR', 'Sam Rivera', '9:32', 'Maple is roomed in 2, intake + vitals are in. Temp a touch high.', true],
              ['AR', 'Dr. Reyes', '9:36', 'Thanks — heading in now. Left ear looks like the recurring yeast, grabbing cytology.', false],
              ['JE', 'Jordan Ellis', '9:40', 'Owner asked about the dental estimate for next visit, noted on the record.', false],
            ].map(([initials, name, time, body, linked]) => (
              <div key={String(time)} className={s.msg}>
                <span className={s.msgAvatar}>{initials}</span>
                <div className={s.msgBody}>
                  <header>
                    <strong>{name}</strong>
                    <time>{time} AM</time>
                  </header>
                  <p>{body}</p>
                  {linked ? (
                    <span className={s.msgLinked}>
                      ⧉ Linked record · <b>Maple Reyes</b> — Wellness exam
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className={s.msgComposer}>Message # clinical-floor…</div>
        </div>
        <div className={s.msgCtx}>
          <p className={s.msgCtxLabel}>About</p>
          <p>Shift handoffs, room status, and anything the next person needs.</p>
          <p className={s.msgCtxLabel}>Members</p>
          {['Dr. Alex Reyes', 'Sam Rivera', 'Jordan Ellis', 'Priya Shah'].map((n) => (
            <div key={n} className={s.msgPerson}>
              <span>{n.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
              {n}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const DEFAULT_JOURNEY: SparkiJourney = {
  step: 4,
  label: 'In Exam',
  action: 'Exam in progress',
  detail: 'Room 2 · Dr. Reyes',
  tone: 'exam',
  note: 'Exam → Plan → Client decision',
  owner: 'Veterinarian',
};

export function SparkiCanvas({
  scene,
  role = 'veterinarian',
  journey = DEFAULT_JOURNEY,
  className,
  style,
  innerRef,
}: {
  scene: SparkiScene;
  role?: SparkiRole;
  journey?: SparkiJourney;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  innerRef?: Ref<HTMLDivElement> | undefined;
}) {
  const bar = TOPBAR[scene];
  const user = ROLE_USER[role];
  const activeNav = SCENE_NAV[scene];
  const reducedMotion = useReducedMotion();

  // A quiet "the clinic is operating" ambient loop, scoped to the dashboard
  // scene only (the hero) so the journey canvas never idles on its own.
  const [liveTick, setLiveTick] = useState(0);
  useEffect(() => {
    if (scene !== 'dashboard' || reducedMotion) return;
    const id = setInterval(() => setLiveTick((tick) => tick + 1), 10000);
    return () => clearInterval(id);
  }, [scene, reducedMotion]);
  const liveMinutes = 9 * 60 + 41 + liveTick;
  const liveClock = `${Math.floor(liveMinutes / 60)}:${String(liveMinutes % 60).padStart(2, '0')} AM`;

  return (
    <div
      ref={innerRef}
      className={className ? `${s.window} ${className}` : s.window}
      style={style}
      data-scene={scene}
      data-role={role}
      aria-hidden="true"
    >
      <div className={s.chrome}>
        <span className={s.chromeDots}>
          <i />
          <i />
          <i />
        </span>
        <span className={s.chromeUrl}>
          <b>sparki.vet</b> / {activeNav.toLowerCase().replace(/[^a-z]+/g, '-')}
        </span>
        <span className={s.chromeTag}>Illustrative preview</span>
      </div>
      <div className={s.shell}>
        <aside className={s.sidebar}>
          <div className={s.sidebarTop}>
            <span className={s.brand} role="img" aria-label="Sparki">
              <SparkiLogo kind="mark" />
              <SparkiLogo kind="wordmark" />
            </span>
            <span className={s.collapse}>‹</span>
          </div>
          <nav className={s.nav} key={scene}>
            {NAV.map((item) => (
              <span
                key={item.label}
                className={s.navItem}
                data-active={item.label === activeNav}
                data-muted={item.muted}
              >
                <svg viewBox="0 0 24 24">
                  <path d={item.d} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {item.label}
              </span>
            ))}
          </nav>
        </aside>
        <div className={s.body}>
          <div className={s.topbar}>
            <div>
              <p className={s.eyebrow}>{bar.eyebrow}</p>
              <p className={s.title}>{bar.title}</p>
              <p className={s.subtitle}>{bar.subtitle}</p>
            </div>
            <div className={s.tools}>
              <div className={s.contextPill}>
                <div className={s.ctxWeather}>
                  <span>☀️</span>
                  <span className={s.ctxStack}>
                    <strong>72°</strong>
                    <small>Clear</small>
                  </span>
                </div>
                <div>
                  <span className={s.ctxStack}>
                    <strong>Tue, Sep 9</strong>
                    <small>{liveClock}</small>
                  </span>
                </div>
                <div>
                  <span className={s.ctxAvatar}>{user.initials}</span>
                  <span className={s.ctxStack}>
                    <strong>{user.name}</strong>
                    <small>{user.label}</small>
                  </span>
                  <span className={s.ctxChevron}>⌄</span>
                </div>
              </div>
              <span className={s.refresh}>Refresh</span>
            </div>
          </div>
          <div className={s.stage}>
            <DashboardScene role={role} active={scene === 'dashboard'} liveTick={liveTick} />
            <TodayScene journey={journey} active={scene === 'today'} />
            <SchedulerScene active={scene === 'scheduler'} />
            <PatientScene journey={journey} active={scene === 'patient'} />
            <BillingScene journey={journey} active={scene === 'billing'} />
            <InventoryScene active={scene === 'inventory'} />
            {/* Team Messages isn't part of the marketed product story yet — only
                mount it if a caller actually asks for the scene, so its copy
                never sits (invisible but present) in the public landing-page DOM. */}
            {scene === 'messages' ? <MessagesScene active /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
