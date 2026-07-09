// =============================================================================
// PROTECTED LOCAL DEMO DATA — DO NOT DELETE
// =============================================================================
// Everything this script writes (Clients, Patients, Appointments, Visits, and
// the 6 demo staff Users) is intentionally persistent local seed data for
// manually testing the Scheduler, Today page, Patients page, and Command
// Center against a realistic small clinic.
//
// Every row this script creates that supports provenance fields is tagged
// with `sourceSystem: 'sparki-local-demo'`. Future cleanup scripts, test
// teardown, migrations, or follow-up prompts must NOT delete rows where
// sourceSystem = 'sparki-local-demo' unless a human explicitly asks for it.
// (scripts/reset-demo-clinic-data.mjs's clearDevClinicalData() has been
// updated to exclude these rows from its deleteMany calls — see that file.)
//
// This script is idempotent: every row uses a fixed, stable id (or a stable
// compound unique key) and is written via upsert, never deleteMany/truncate.
// Re-running it updates the same rows in place — appointment dates are
// recomputed relative to "today" each run, but the row identities never
// change and no duplicates are created.
//
// Usage: pnpm seed:local-demo   (from repo root; needs DATABASE_URL in .env)
// =============================================================================

import prismaClientPackage from '../packages/db/generated/client/index.js';

const { PrismaClient } = prismaClientPackage;
const prisma = new PrismaClient();

const DEV_ORGANIZATION_ID = 'dev-organization';
const DEV_LOCATION_ID = 'dev-location';
const SOURCE_SYSTEM = 'sparki-local-demo';
const IMPORTED_AT = new Date('2026-01-01T00:00:00.000Z');
const SOURCE_CONFIDENCE = 1;

const NOW = new Date();

function dayOffsetAt(offsetDays, hour, minute) {
  const date = new Date(NOW);
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function dateOfBirth(isoDate) {
  return new Date(`${isoDate}T12:00:00.000Z`);
}

function withProvenance(sourceId, fields) {
  return {
    ...fields,
    sourceSystem: SOURCE_SYSTEM,
    sourceId,
    sourceConfidence: SOURCE_CONFIDENCE,
    importedAt: IMPORTED_AT,
  };
}

// -----------------------------------------------------------------------------
// Staff — 2 doctors + 4 support staff, fixed ids so re-runs upsert in place.
// -----------------------------------------------------------------------------

const STAFF = [
  {
    id: 'local-demo-staff-anna-carter',
    firstName: 'Anna',
    lastName: 'Carter',
    displayName: 'Dr. Anna Carter',
    email: 'anna.carter@sparki-local-demo.vet',
    role: 'VETERINARIAN',
    jobTitle: 'Veterinarian',
    licenseNumber: 'VET-LOCAL-001',
    canReceiveAppointments: true,
    canOwnVisits: true,
    color: '#0EA5A4',
  },
  {
    id: 'local-demo-staff-miles-bennett',
    firstName: 'Miles',
    lastName: 'Bennett',
    displayName: 'Dr. Miles Bennett',
    email: 'miles.bennett@sparki-local-demo.vet',
    role: 'VETERINARIAN',
    jobTitle: 'Veterinarian',
    licenseNumber: 'VET-LOCAL-002',
    canReceiveAppointments: true,
    canOwnVisits: true,
    color: '#2563EB',
  },
  {
    id: 'local-demo-staff-olivia-reed',
    firstName: 'Olivia',
    lastName: 'Reed',
    email: 'olivia.reed@sparki-local-demo.vet',
    role: 'PRACTICE_MANAGER',
    jobTitle: 'Practice Manager',
    canReceiveAppointments: false,
    canOwnVisits: false,
    color: '#7C3AED',
  },
  {
    id: 'local-demo-staff-marcus-lee',
    firstName: 'Marcus',
    lastName: 'Lee',
    email: 'marcus.lee@sparki-local-demo.vet',
    role: 'TECHNICIAN',
    jobTitle: 'Veterinary Technician',
    canReceiveAppointments: true,
    canOwnVisits: true,
    color: '#DB2777',
  },
  {
    id: 'local-demo-staff-hannah-brooks',
    firstName: 'Hannah',
    lastName: 'Brooks',
    email: 'hannah.brooks@sparki-local-demo.vet',
    role: 'RECEPTIONIST',
    jobTitle: 'Front Desk Coordinator',
    canReceiveAppointments: false,
    canOwnVisits: true,
    color: '#F59E0B',
  },
  {
    id: 'local-demo-staff-sofia-nguyen',
    firstName: 'Sofia',
    lastName: 'Nguyen',
    email: 'sofia.nguyen@sparki-local-demo.vet',
    role: 'ASSISTANT',
    jobTitle: 'Veterinary Assistant',
    canReceiveAppointments: false,
    canOwnVisits: true,
    color: '#16A34A',
  },
];

const VET_A = 'local-demo-staff-anna-carter';
const VET_B = 'local-demo-staff-miles-bennett';
const TECH = 'local-demo-staff-marcus-lee';
const RECEPTIONIST = 'local-demo-staff-hannah-brooks';

// -----------------------------------------------------------------------------
// Clients — 18 households, realistic contact + address info.
// -----------------------------------------------------------------------------

const CLIENTS = [
  { key: 'sarah-johnson', firstName: 'Sarah', lastName: 'Johnson', email: 'sarah.johnson@example.com', phone: '(312) 555-0142', addressLine1: '118 Maple Ave', city: 'Springfield', state: 'IL', postalCode: '62701' },
  { key: 'michael-lee', firstName: 'Michael', lastName: 'Lee', email: 'michael.lee@example.com', phone: '(312) 555-0198', addressLine1: '44 Oak St', city: 'Springfield', state: 'IL', postalCode: '62702' },
  { key: 'emily-davis', firstName: 'Emily', lastName: 'Davis', email: 'emily.davis@example.com', phone: '(312) 555-0173', addressLine1: '210 Birch Rd', city: 'Springfield', state: 'IL', postalCode: '62703' },
  { key: 'david-wilson', firstName: 'David', lastName: 'Wilson', email: 'david.wilson@example.com', phone: '(312) 555-0110', addressLine1: '77 Elm St', city: 'Springfield', state: 'IL', postalCode: '62701' },
  { key: 'priya-patel', firstName: 'Priya', lastName: 'Patel', email: 'priya.patel@example.com', phone: '(312) 555-0164', addressLine1: '305 Cedar Ln', city: 'Springfield', state: 'IL', postalCode: '62704' },
  { key: 'jason-kim', firstName: 'Jason', lastName: 'Kim', email: 'jason.kim@example.com', phone: '(312) 555-0187', addressLine1: '12 Willow Ct', city: 'Springfield', state: 'IL', postalCode: '62702' },
  { key: 'laura-martinez', firstName: 'Laura', lastName: 'Martinez', email: 'laura.martinez@example.com', phone: '(312) 555-0121', addressLine1: '89 Pine St', city: 'Springfield', state: 'IL', postalCode: '62703' },
  { key: 'chris-anderson', firstName: 'Chris', lastName: 'Anderson', email: 'chris.anderson@example.com', phone: '(312) 555-0155', addressLine1: '501 Aspen Dr', city: 'Springfield', state: 'IL', postalCode: '62701' },
  { key: 'nina-thompson', firstName: 'Nina', lastName: 'Thompson', email: 'nina.thompson@example.com', phone: '(312) 555-0133', addressLine1: '27 Chestnut Ave', city: 'Springfield', state: 'IL', postalCode: '62704' },
  { key: 'robert-garcia', firstName: 'Robert', lastName: 'Garcia', email: 'robert.garcia@example.com', phone: '(312) 555-0146', addressLine1: '66 Magnolia Blvd', city: 'Springfield', state: 'IL', postalCode: '62702' },
  { key: 'amanda-white', firstName: 'Amanda', lastName: 'White', email: 'amanda.white@example.com', phone: '(312) 555-0179', addressLine1: '902 Sycamore St', city: 'Springfield', state: 'IL', postalCode: '62703' },
  { key: 'kevin-brown', firstName: 'Kevin', lastName: 'Brown', email: 'kevin.brown@example.com', phone: '(312) 555-0128', addressLine1: '15 Poplar Rd', city: 'Springfield', state: 'IL', postalCode: '62701' },
  { key: 'rachel-green', firstName: 'Rachel', lastName: 'Green', email: 'rachel.green@example.com', phone: '(312) 555-0191', addressLine1: '233 Cypress Ln', city: 'Springfield', state: 'IL', postalCode: '62704' },
  { key: 'daniel-clark', firstName: 'Daniel', lastName: 'Clark', email: 'daniel.clark@example.com', phone: '(312) 555-0117', addressLine1: '48 Redwood Ave', city: 'Springfield', state: 'IL', postalCode: '62702' },
  { key: 'megan-scott', firstName: 'Megan', lastName: 'Scott', email: 'megan.scott@example.com', phone: '(312) 555-0184', addressLine1: '71 Fir St', city: 'Springfield', state: 'IL', postalCode: '62703' },
  { key: 'tyler-adams', firstName: 'Tyler', lastName: 'Adams', email: 'tyler.adams@example.com', phone: '(312) 555-0139', addressLine1: '320 Spruce Dr', city: 'Springfield', state: 'IL', postalCode: '62701' },
  { key: 'jessica-turner', firstName: 'Jessica', lastName: 'Turner', email: 'jessica.turner@example.com', phone: '(312) 555-0162', addressLine1: '19 Hawthorn Ct', city: 'Springfield', state: 'IL', postalCode: '62704' },
  { key: 'brian-foster', firstName: 'Brian', lastName: 'Foster', email: 'brian.foster@example.com', phone: '(312) 555-0175', addressLine1: '606 Juniper Ave', city: 'Springfield', state: 'IL', postalCode: '62702' },
].map((client) => ({ ...client, country: 'US' }));

// -----------------------------------------------------------------------------
// Patients — 22 patients across the 18 households above (a few 2-pet homes).
// lastName mirrors the primary client's lastName, matching PatientsService
// convention (see prisma/schema.prisma Patient.lastName comment).
// -----------------------------------------------------------------------------

const PATIENTS = [
  { key: 'bella-johnson', clientKey: 'sarah-johnson', name: 'Bella', species: 'Canine', breed: 'Golden Retriever', sex: 'Female spayed', dob: '2020-04-12', weight: 58.2, color: 'Golden' },
  { key: 'whiskers-johnson', clientKey: 'sarah-johnson', name: 'Whiskers', species: 'Feline', breed: 'Domestic Shorthair', sex: 'Male neutered', dob: '2021-08-03', weight: 11.4, color: 'Gray tabby' },
  { key: 'max-lee', clientKey: 'michael-lee', name: 'Max', species: 'Canine', breed: 'Labrador Retriever', sex: 'Male neutered', dob: '2019-02-20', weight: 72.5, color: 'Black' },
  { key: 'luna-davis', clientKey: 'emily-davis', name: 'Luna', species: 'Feline', breed: 'Siamese', sex: 'Female spayed', dob: '2022-01-15', weight: 8.9, color: 'Cream and brown' },
  { key: 'rex-davis', clientKey: 'emily-davis', name: 'Rex', species: 'Canine', breed: 'Beagle', sex: 'Male neutered', dob: '2020-11-02', weight: 24.3, color: 'Tricolor' },
  { key: 'cooper-wilson', clientKey: 'david-wilson', name: 'Cooper', species: 'Canine', breed: 'French Bulldog', sex: 'Male neutered', dob: '2021-06-18', weight: 26.8, color: 'Fawn' },
  { key: 'milo-patel', clientKey: 'priya-patel', name: 'Milo', species: 'Feline', breed: 'Maine Coon', sex: 'Male neutered', dob: '2019-09-09', weight: 15.6, color: 'Brown tabby' },
  { key: 'daisy-kim', clientKey: 'jason-kim', name: 'Daisy', species: 'Canine', breed: 'Poodle', sex: 'Female spayed', dob: '2022-03-25', weight: 14.2, color: 'White' },
  { key: 'rocky-martinez', clientKey: 'laura-martinez', name: 'Rocky', species: 'Canine', breed: 'Boxer', sex: 'Male neutered', dob: '2018-12-01', weight: 65.0, color: 'Brindle' },
  { key: 'coco-martinez', clientKey: 'laura-martinez', name: 'Coco', species: 'Feline', breed: 'Domestic Longhair', sex: 'Female spayed', dob: '2021-05-14', weight: 9.8, color: 'Black' },
  { key: 'shadow-anderson', clientKey: 'chris-anderson', name: 'Shadow', species: 'Feline', breed: 'Domestic Shorthair', sex: 'Male neutered', dob: '2020-07-07', weight: 12.1, color: 'Black' },
  { key: 'buddy-thompson', clientKey: 'nina-thompson', name: 'Buddy', species: 'Canine', breed: 'Golden Retriever Mix', sex: 'Male neutered', dob: '2017-10-10', weight: 68.4, color: 'Golden' },
  { key: 'oliver-garcia', clientKey: 'robert-garcia', name: 'Oliver', species: 'Feline', breed: 'British Shorthair', sex: 'Male neutered', dob: '2022-02-02', weight: 13.0, color: 'Blue-gray' },
  { key: 'charlie-white', clientKey: 'amanda-white', name: 'Charlie', species: 'Canine', breed: 'Dachshund', sex: 'Male neutered', dob: '2019-04-22', weight: 18.7, color: 'Chocolate' },
  { key: 'lucy-brown', clientKey: 'kevin-brown', name: 'Lucy', species: 'Canine', breed: 'Australian Shepherd', sex: 'Female spayed', dob: '2020-08-30', weight: 45.3, color: 'Merle' },
  { key: 'simba-green', clientKey: 'rachel-green', name: 'Simba', species: 'Feline', breed: 'Domestic Shorthair', sex: 'Male neutered', dob: '2021-11-11', weight: 14.5, color: 'Orange tabby' },
  { key: 'zoey-clark', clientKey: 'daniel-clark', name: 'Zoey', species: 'Canine', breed: 'Shih Tzu', sex: 'Female spayed', dob: '2020-01-05', weight: 12.9, color: 'White and brown' },
  { key: 'thumper-scott', clientKey: 'megan-scott', name: 'Thumper', species: 'Rabbit', breed: 'Holland Lop', sex: 'Male neutered', dob: '2022-06-15', weight: 4.1, color: 'Brown and white' },
  { key: 'duke-adams', clientKey: 'tyler-adams', name: 'Duke', species: 'Canine', breed: 'German Shepherd', sex: 'Male neutered', dob: '2018-05-19', weight: 78.6, color: 'Black and tan' },
  { key: 'peanut-adams', clientKey: 'tyler-adams', name: 'Peanut', species: 'Guinea Pig', breed: 'American Guinea Pig', sex: 'Male', dob: '2023-02-14', weight: 2.2, color: 'Brown and white' },
  { key: 'chloe-turner', clientKey: 'jessica-turner', name: 'Chloe', species: 'Feline', breed: 'Ragdoll', sex: 'Female spayed', dob: '2021-09-27', weight: 10.3, color: 'Cream' },
  { key: 'winston-foster', clientKey: 'brian-foster', name: 'Winston', species: 'Canine', breed: 'Bulldog', sex: 'Male neutered', dob: '2019-12-08', weight: 52.0, color: 'White and brindle' },
];

// -----------------------------------------------------------------------------
// Appointment reason templates — the 12 example visit types from the request,
// each mapped to a real AppointmentType enum value (no invented values).
// -----------------------------------------------------------------------------

const TEMPLATES = [
  { key: 'wellness', type: 'WellnessPreventiveCare', reason: 'Annual wellness exam', duration: 30, providerRole: 'vet' },
  { key: 'vaccine', type: 'Vaccination', reason: 'Vaccine booster appointment', duration: 20, providerRole: 'vet' },
  { key: 'dental', type: 'SickVisit', reason: 'Dental consult', duration: 30, providerRole: 'vet' },
  { key: 'recheck', type: 'Recheck', reason: 'Recheck exam', duration: 20, providerRole: 'vet' },
  { key: 'surgeryDropOff', type: 'DropOff', reason: 'Surgery drop-off', duration: 15, providerRole: 'vet' },
  { key: 'urgent', type: 'EmergencyUrgent', reason: 'Urgent care visit', duration: 45, providerRole: 'vet' },
  { key: 'earInfection', type: 'SickVisit', reason: 'Ear infection check', duration: 20, providerRole: 'vet' },
  { key: 'limping', type: 'SickVisit', reason: 'Limping - evaluate gait', duration: 30, providerRole: 'vet' },
  { key: 'vomitDiarrhea', type: 'SickVisit', reason: 'Vomiting and diarrhea', duration: 30, providerRole: 'vet' },
  { key: 'medRefill', type: 'Recheck', reason: 'Medication refill discussion', duration: 15, providerRole: 'vet' },
  { key: 'techAppt', type: 'TechnicianAppointment', reason: 'Weight check and bloodwork draw', duration: 15, providerRole: 'tech' },
  { key: 'nailTrim', type: 'TechnicianAppointment', reason: 'Nail trim', duration: 15, providerRole: 'tech' },
];

/** Mirrors apps/api/src/visits/visits.service.ts APPOINTMENT_TYPE_TO_VISIT_TYPE
 *  so seeded visits use the same visitType a real check-in would produce. */
const APPOINTMENT_TYPE_TO_VISIT_TYPE = {
  WellnessPreventiveCare: 'Scheduled',
  SickVisit: 'Scheduled',
  Recheck: 'Scheduled',
  TechnicianAppointment: 'TechnicianAppointment',
  Vaccination: 'Scheduled',
  SurgeryProcedure: 'SurgeryAdmission',
  DropOff: 'DropOff',
  EmergencyUrgent: 'Emergency',
  Telemedicine: 'Telemedicine',
  Euthanasia: 'Scheduled',
  BoardingNonMedical: 'Scheduled',
};

// -----------------------------------------------------------------------------
// Schedule plan — yesterday, today (richest), tomorrow, and the next 7 days.
// Times land between 8:00 AM and 6:00 PM with natural gaps (not every slot
// filled). "Today" states are computed dynamically relative to real now, so
// re-running later in the day advances which slots look checked-in/in-room/
// completed, exactly like a real clinic's day would progress.
// -----------------------------------------------------------------------------

const YESTERDAY_SLOTS = [
  { hour: 9, minute: 0 },
  { hour: 10, minute: 30 },
  { hour: 13, minute: 0 },
  { hour: 14, minute: 30 },
  { hour: 16, minute: 0 },
  { hour: 16, minute: 45, cancelled: true },
];

const TODAY_SLOTS = [
  { hour: 8, minute: 0 },
  { hour: 8, minute: 30 },
  { hour: 9, minute: 0 },
  { hour: 9, minute: 30 },
  { hour: 10, minute: 15 },
  { hour: 11, minute: 0 },
  { hour: 11, minute: 45 },
  { hour: 13, minute: 0 },
  { hour: 14, minute: 30 },
  { hour: 16, minute: 0 },
  { hour: 17, minute: 0 },
];

const TOMORROW_SLOTS = [
  { hour: 8, minute: 30 },
  { hour: 9, minute: 30 },
  { hour: 10, minute: 30 },
  { hour: 13, minute: 0 },
  { hour: 14, minute: 0 },
  { hour: 16, minute: 30 },
];

const FUTURE_DAY_SLOTS = [
  { hour: 9, minute: 0 },
  { hour: 10, minute: 30 },
  { hour: 13, minute: 30 },
  { hour: 15, minute: 0 },
];

/** Buckets today's past slots into the richest-first mix the request asks
 *  for (Ready for Checkout / In Room / Checked In closest to now, older past
 *  slots Completed), and future slots as Upcoming. */
function bucketTodaySlots(slots, now) {
  const withTimes = slots.map((slot) => ({ slot, at: dayOffsetAt(0, slot.hour, slot.minute) }));
  const past = withTimes.filter((entry) => entry.at <= now).sort((a, b) => b.at - a.at);
  const future = withTimes.filter((entry) => entry.at > now).sort((a, b) => a.at - b.at);

  const specialOrder = ['checkedIn', 'inRoomTriage', 'inRoomExam', 'checkoutReady'];
  const buckets = new Map();
  past.forEach((entry, index) => {
    buckets.set(entry.slot, index < specialOrder.length ? specialOrder[index] : 'completed');
  });
  future.forEach((entry, index) => {
    buckets.set(entry.slot, index % 2 === 0 ? 'upcomingScheduled' : 'upcomingConfirmed');
  });
  return buckets;
}

const BUCKET_TO_STATES = {
  completed: { appointmentState: 'Completed', visitState: 'Archived' },
  checkedIn: { appointmentState: 'VisitCreated', visitState: 'Waiting' },
  inRoomTriage: { appointmentState: 'VisitCreated', visitState: 'IntakeInProgress' },
  inRoomExam: { appointmentState: 'VisitCreated', visitState: 'VeterinarianExamInProgress' },
  checkoutReady: { appointmentState: 'VisitCreated', visitState: 'CheckoutReady' },
  upcomingScheduled: { appointmentState: 'Scheduled', visitState: null },
  upcomingConfirmed: { appointmentState: 'Confirmed', visitState: null },
};

function buildAppointmentPlan() {
  const plan = [];
  let patientCursor = 0;
  let templateCursor = 0;
  let vetCursor = 0;

  function nextPatient() {
    const patient = PATIENTS[patientCursor % PATIENTS.length];
    patientCursor += 1;
    return patient;
  }

  function nextTemplate() {
    const template = TEMPLATES[templateCursor % TEMPLATES.length];
    templateCursor += 1;
    return template;
  }

  function nextVet() {
    const vet = vetCursor % 2 === 0 ? VET_A : VET_B;
    vetCursor += 1;
    return vet;
  }

  function providerFor(template) {
    return template.providerRole === 'tech' ? TECH : nextVet();
  }

  // Yesterday — mostly completed, one cancelled.
  for (const slot of YESTERDAY_SLOTS) {
    const patient = nextPatient();
    const template = nextTemplate();
    const provider = providerFor(template);
    const scheduledAt = dayOffsetAt(-1, slot.hour, slot.minute);
    if (slot.cancelled) {
      plan.push({
        idSuffix: `yesterday-${slot.hour}${slot.minute}`,
        patient,
        template,
        provider,
        scheduledAt,
        appointmentState: 'Cancelled',
        visitState: null,
      });
      continue;
    }
    plan.push({
      idSuffix: `yesterday-${slot.hour}${slot.minute}`,
      patient,
      template,
      provider,
      scheduledAt,
      appointmentState: 'Completed',
      visitState: 'Archived',
    });
  }

  // Today — richest day, dynamic bucketing relative to real now.
  const todayBuckets = bucketTodaySlots(TODAY_SLOTS, NOW);
  for (const slot of TODAY_SLOTS) {
    const patient = nextPatient();
    const template = nextTemplate();
    const provider = providerFor(template);
    const bucket = todayBuckets.get(slot);
    const { appointmentState, visitState } = BUCKET_TO_STATES[bucket];
    plan.push({
      idSuffix: `today-${slot.hour}${slot.minute}`,
      patient,
      template,
      provider,
      scheduledAt: dayOffsetAt(0, slot.hour, slot.minute),
      appointmentState,
      visitState,
    });
  }

  // Tomorrow — fully upcoming.
  TOMORROW_SLOTS.forEach((slot, index) => {
    const patient = nextPatient();
    const template = nextTemplate();
    const provider = providerFor(template);
    plan.push({
      idSuffix: `tomorrow-${slot.hour}${slot.minute}`,
      patient,
      template,
      provider,
      scheduledAt: dayOffsetAt(1, slot.hour, slot.minute),
      appointmentState: index % 2 === 0 ? 'Scheduled' : 'Confirmed',
      visitState: null,
    });
  });

  // Next 7 days (day offsets 2-7 plus the +7 boundary already covered by
  // tomorrow=1..7 inclusive) — a normal, lighter future schedule.
  for (let dayOffset = 2; dayOffset <= 7; dayOffset += 1) {
    for (const slot of FUTURE_DAY_SLOTS) {
      const patient = nextPatient();
      const template = nextTemplate();
      const provider = providerFor(template);
      plan.push({
        idSuffix: `plus${dayOffset}-${slot.hour}${slot.minute}`,
        patient,
        template,
        provider,
        scheduledAt: dayOffsetAt(dayOffset, slot.hour, slot.minute),
        appointmentState: 'Scheduled',
        visitState: null,
      });
    }
  }

  return plan;
}

// -----------------------------------------------------------------------------
// Upsert helpers
// -----------------------------------------------------------------------------

async function ensureClinic() {
  const organization = await prisma.organization.upsert({
    where: { id: DEV_ORGANIZATION_ID },
    update: { name: 'Sparki Demo Animal Hospital' },
    create: { id: DEV_ORGANIZATION_ID, name: 'Sparki Demo Animal Hospital' },
  });
  const location = await prisma.location.upsert({
    where: { id: DEV_LOCATION_ID },
    update: { name: 'Sparki Demo Animal Hospital - Main', organizationId: organization.id },
    create: {
      id: DEV_LOCATION_ID,
      organizationId: organization.id,
      name: 'Sparki Demo Animal Hospital - Main',
    },
  });
  return { organization, location };
}

async function ensureStaff(organizationId, locationId) {
  for (const member of STAFF) {
    await prisma.user.upsert({
      where: { id: member.id },
      update: {
        organizationId,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        displayName: member.displayName ?? null,
        role: member.role,
        isActive: true,
        locations: { set: [{ id: locationId }] },
        staffProfile: {
          upsert: {
            update: {
              jobTitle: member.jobTitle,
              licenseNumber: member.licenseNumber ?? null,
              canReceiveAppointments: member.canReceiveAppointments,
              canOwnVisits: member.canOwnVisits,
              color: member.color,
            },
            create: {
              jobTitle: member.jobTitle,
              licenseNumber: member.licenseNumber ?? null,
              canReceiveAppointments: member.canReceiveAppointments,
              canOwnVisits: member.canOwnVisits,
              color: member.color,
            },
          },
        },
      },
      create: {
        id: member.id,
        organizationId,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        displayName: member.displayName ?? null,
        role: member.role,
        isActive: true,
        locations: { connect: [{ id: locationId }] },
        staffProfile: {
          create: {
            jobTitle: member.jobTitle,
            licenseNumber: member.licenseNumber ?? null,
            canReceiveAppointments: member.canReceiveAppointments,
            canOwnVisits: member.canOwnVisits,
            color: member.color,
          },
        },
      },
    });

    // ADR-006: additive alongside the User.organizationId/role write above —
    // AuthService.resolveMembership reads these tables, matching the
    // convention in scripts/seed-auth-users.mjs.
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId, userId: member.id } },
      update: { role: member.role, isActive: true },
      create: { organizationId, userId: member.id, role: member.role, isActive: true },
    });
    await prisma.clinicLocationAccess.upsert({
      where: { clinicLocationId_userId: { clinicLocationId: locationId, userId: member.id } },
      update: { role: member.role, isActive: true },
      create: {
        organizationId,
        clinicLocationId: locationId,
        userId: member.id,
        role: member.role,
        isActive: true,
      },
    });
  }
}

async function ensureClients(organizationId) {
  const idByKey = new Map();
  for (const client of CLIENTS) {
    const id = `local-demo-client-${client.key}`;
    const data = withProvenance(id, {
      organizationId,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      phone: client.phone,
      preferredContactMethod: 'Phone',
      addressLine1: client.addressLine1,
      city: client.city,
      state: client.state,
      postalCode: client.postalCode,
      country: client.country,
    });
    await prisma.client.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
    idByKey.set(client.key, id);
  }
  return idByKey;
}

async function ensurePatients(organizationId, clientIdByKey) {
  const idByKey = new Map();
  for (const patient of PATIENTS) {
    const id = `local-demo-patient-${patient.key}`;
    const clientId = clientIdByKey.get(patient.clientKey);
    const client = CLIENTS.find((candidate) => candidate.key === patient.clientKey);
    const data = withProvenance(id, {
      organizationId,
      name: patient.name,
      lastName: client.lastName,
      species: patient.species,
      breed: patient.breed,
      sex: patient.sex,
      dateOfBirth: dateOfBirth(patient.dob),
      weight: patient.weight,
      color: patient.color,
      status: 'Active',
    });
    await prisma.patient.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
    idByKey.set(patient.key, id);

    await prisma.patientClient.upsert({
      where: { patientId_clientId: { patientId: id, clientId } },
      update: { isPrimary: true },
      create: { patientId: id, clientId, isPrimary: true },
    });
  }
  return idByKey;
}

async function ensureAppointmentsAndVisits(organizationId, locationId, patientIdByKey, clientIdByKey) {
  const plan = buildAppointmentPlan();
  let appointmentCount = 0;
  let visitCount = 0;

  for (const entry of plan) {
    const appointmentId = `local-demo-appt-${entry.patient.key}-${entry.idSuffix}`;
    const patientId = patientIdByKey.get(entry.patient.key);
    const clientId = clientIdByKey.get(entry.patient.clientKey);

    const appointmentData = withProvenance(appointmentId, {
      organizationId,
      locationId,
      patientId,
      clientId,
      type: entry.template.type,
      reason: entry.template.reason,
      source: 'Phone',
      state: entry.appointmentState,
      scheduledAt: entry.scheduledAt,
      expectedDurationMinutes: entry.template.duration,
      providerId: entry.provider,
      createdById: RECEPTIONIST,
    });

    await prisma.appointment.upsert({
      where: { id: appointmentId },
      update: appointmentData,
      create: { id: appointmentId, ...appointmentData },
    });
    appointmentCount += 1;

    const visitId = `local-demo-visit-${appointmentId}`;
    if (!entry.visitState) {
      // Upcoming/cancelled appointments have no visit yet, matching the real
      // workflow (a Visit only exists once the appointment reaches Arrived).
      continue;
    }

    const isArchived = entry.visitState === 'Archived';
    const isCheckoutReady = entry.visitState === 'CheckoutReady';
    const isExamOrTreatment = entry.visitState === 'VeterinarianExamInProgress';
    const isIntake = entry.visitState === 'IntakeInProgress';

    const vetOwner = entry.template.providerRole === 'tech' ? null : entry.provider;
    const currentOwnerId = isIntake
      ? TECH
      : isExamOrTreatment || isArchived
        ? (vetOwner ?? entry.provider)
        : RECEPTIONIST;

    await prisma.visit.upsert({
      where: { id: visitId },
      update: {
        organizationId,
        locationId,
        patientId,
        clientId,
        appointmentId,
        visitType: APPOINTMENT_TYPE_TO_VISIT_TYPE[entry.template.type],
        reason: entry.template.reason,
        state: entry.visitState,
        currentOwnerId,
        primaryVeterinarianId: vetOwner,
        assignedTechnicianId: isIntake ? TECH : null,
        createdById: RECEPTIONIST,
        lastUpdatedById: RECEPTIONIST,
        nextAction: isCheckoutReady ? 'Collect payment and discharge patient.' : null,
        archivedAt: isArchived ? entry.scheduledAt : null,
      },
      create: {
        id: visitId,
        organizationId,
        locationId,
        patientId,
        clientId,
        appointmentId,
        visitType: APPOINTMENT_TYPE_TO_VISIT_TYPE[entry.template.type],
        reason: entry.template.reason,
        state: entry.visitState,
        currentOwnerId,
        primaryVeterinarianId: vetOwner,
        assignedTechnicianId: isIntake ? TECH : null,
        createdById: RECEPTIONIST,
        lastUpdatedById: RECEPTIONIST,
        nextAction: isCheckoutReady ? 'Collect payment and discharge patient.' : null,
        archivedAt: isArchived ? entry.scheduledAt : null,
      },
    });
    visitCount += 1;
  }

  return { appointmentCount, visitCount };
}

// -----------------------------------------------------------------------------
// Guardrail — this file's own curated names must never look like automated
// test/fixture debris (see the "Playwright Patient 3pp4ig" class of bug this
// guards against). Applies ONLY to this protected demo seed data, not to
// arbitrary real clinic data elsewhere in the app.
// -----------------------------------------------------------------------------

const GENERATED_NAME_PATTERNS = [
  /playwright/i,
  /duplicate/i,
  /schedule patient/i,
  /visit patient/i,
  /test patient/i,
  /existingintake/i,
  /noapptintake/i,
  // A 5+ char alphanumeric token containing at least one digit reads as a
  // generated id (e.g. fixtureId()'s "3pp4ig"/"ilbkoz") — real human/pet
  // names are all-letters, so this doesn't flag legitimate curated names.
  /\b[a-z0-9]*\d[a-z0-9]{4,}\b/i,
];

function assertRealisticName(label, value) {
  if (!value) return;
  for (const pattern of GENERATED_NAME_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error(
        `Protected demo seed data must use realistic, curated names — "${label}" ("${value}") ` +
          `matches generated-name pattern ${pattern}. Replace it with a real human/pet name.`,
      );
    }
  }
}

function validateCuratedNames() {
  for (const member of STAFF) {
    assertRealisticName('staff.firstName', member.firstName);
    assertRealisticName('staff.lastName', member.lastName);
    assertRealisticName('staff.displayName', member.displayName);
  }
  for (const client of CLIENTS) {
    assertRealisticName('client.firstName', client.firstName);
    assertRealisticName('client.lastName', client.lastName);
  }
  for (const patient of PATIENTS) {
    assertRealisticName('patient.name', patient.name);
  }
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  validateCuratedNames();
  const { organization, location } = await ensureClinic();
  await ensureStaff(organization.id, location.id);
  const clientIdByKey = await ensureClients(organization.id);
  const patientIdByKey = await ensurePatients(organization.id, clientIdByKey);
  const { appointmentCount, visitCount } = await ensureAppointmentsAndVisits(
    organization.id,
    location.id,
    patientIdByKey,
    clientIdByKey,
  );

  console.log('Sparki local clinic demo data seeded:');
  console.log(`  Organization: ${organization.name} (${organization.id})`);
  console.log(`  Location: ${location.name} (${location.id})`);
  console.log(`  Staff: ${STAFF.length}`);
  console.log(`  Clients: ${CLIENTS.length}`);
  console.log(`  Patients: ${PATIENTS.length}`);
  console.log(`  Appointments: ${appointmentCount}`);
  console.log(`  Visits: ${visitCount}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
