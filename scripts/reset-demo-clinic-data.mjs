import prismaClientPackage from '../packages/db/generated/client/index.js';

const { PrismaClient } = prismaClientPackage;
const prisma = new PrismaClient();

const DEV_ORGANIZATION_ID = 'dev-organization';
const DEV_LOCATION_ID = 'dev-location';

// Rows from scripts/seed-local-clinic-demo-data.mjs are tagged with this
// sourceSystem and must never be touched by clearDevClinicalData() below —
// that script's data is protected, persistent local demo data, not
// throwaway case fixtures like the ones this file generates.
//
// NOTE: `{ sourceSystem: { not: PROTECTED_SOURCE_SYSTEM } }` alone is NOT
// enough — Prisma/SQL's "not equals" on a nullable column excludes NULL rows
// too (three-valued logic: `NULL <> 'x'` is unknown, not true), and this
// script's own case data always has sourceSystem = null. Without the
// `{ sourceSystem: null }` branch below, this filter would silently match
// zero rows and clearDevClinicalData() would delete nothing at all.
const PROTECTED_SOURCE_SYSTEM = 'sparki-local-demo';
const NOT_PROTECTED = {
  OR: [{ sourceSystem: null }, { sourceSystem: { not: PROTECTED_SOURCE_SYSTEM } }],
};

function todayAt(hour, minute) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60_000);
}

/** Relative to actual run time, not a fixed clock hour, so "upcoming"
 *  appointments reliably satisfy scheduledAt >= now no matter when this
 *  script runs during the day. */
function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 3_600_000);
}

function dateOfBirth(isoDate) {
  return new Date(`${isoDate}T12:00:00.000Z`);
}

// Fixed, well-known IDs (not generated cuids) so repeated runs upsert the
// same rows instead of accumulating duplicates.
// A 3-6 person clinic roster, not a hospital-scale staff directory: two
// vets, two techs, one front desk coordinator.
const STAFF = [
  {
    id: 'staff-front-desk-1',
    firstName: 'Marcus',
    lastName: 'Nguyen',
    email: 'marcus.nguyen@sparkidemo.vet',
    role: 'RECEPTIONIST',
    jobTitle: 'Front Desk Coordinator',
    canReceiveAppointments: false,
    canOwnVisits: true,
    color: '#F59E0B',
  },
  {
    id: 'staff-vet-1',
    firstName: 'Priya',
    lastName: 'Shah',
    displayName: 'Dr. Priya Shah',
    email: 'priya.shah@sparkidemo.vet',
    role: 'VETERINARIAN',
    jobTitle: 'Veterinarian',
    licenseNumber: 'VET-10432',
    canReceiveAppointments: true,
    canOwnVisits: true,
    color: '#059669',
  },
  {
    id: 'staff-vet-2',
    firstName: 'Owen',
    lastName: 'Brennan',
    displayName: 'Dr. Owen Brennan',
    email: 'owen.brennan@sparkidemo.vet',
    role: 'VETERINARIAN',
    jobTitle: 'Veterinarian',
    licenseNumber: 'VET-10877',
    canReceiveAppointments: true,
    canOwnVisits: true,
    color: '#16A34A',
  },
  {
    id: 'staff-tech-1',
    firstName: 'Kayla',
    lastName: 'Morris',
    email: 'kayla.morris@sparkidemo.vet',
    role: 'TECHNICIAN',
    jobTitle: 'Veterinary Technician',
    canReceiveAppointments: true,
    canOwnVisits: true,
    color: '#DB2777',
  },
  {
    id: 'staff-tech-2',
    firstName: 'Ben',
    lastName: 'Alvarado',
    email: 'ben.alvarado@sparkidemo.vet',
    role: 'TECHNICIAN',
    jobTitle: 'Veterinary Technician',
    canReceiveAppointments: true,
    canOwnVisits: true,
    color: '#DC2626',
  },
];

async function ensureDevClinic() {
  const organization = await prisma.organization.upsert({
    where: { id: DEV_ORGANIZATION_ID },
    update: { name: 'Sparki Development Clinic' },
    create: { id: DEV_ORGANIZATION_ID, name: 'Sparki Development Clinic' },
  });

  const location = await prisma.location.upsert({
    where: { id: DEV_LOCATION_ID },
    update: { name: 'Main Hospital' },
    create: {
      id: DEV_LOCATION_ID,
      organizationId: organization.id,
      name: 'Main Hospital',
    },
  });

  // A demo clinic texts in labelled simulation. A real clinic has no channel
  // (and no Communication tab) until its number is registered and approved.
  await prisma.clientMessagingChannel.upsert({
    where: { locationId: location.id },
    update: {},
    create: { organizationId: organization.id, locationId: location.id, provider: 'SIMULATED', status: 'ACTIVE' },
  });

  for (const member of STAFF) {
    await prisma.user.upsert({
      where: { id: member.id },
      update: {
        organizationId: organization.id,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        displayName: member.displayName ?? null,
        role: member.role,
        isActive: true,
        locations: { set: [{ id: location.id }] },
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
        organizationId: organization.id,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        displayName: member.displayName ?? null,
        role: member.role,
        locations: { connect: [{ id: location.id }] },
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
  }

  return { organization, location };
}

async function clearDevClinicalData() {
  // Every deleteMany below is scoped to DEV_ORGANIZATION_ID *and* excludes
  // protected local demo data (sourceSystem = 'sparki-local-demo') — see
  // scripts/seed-local-clinic-demo-data.mjs's header comment for why that
  // data must survive this reset.
  await prisma.visitIntake.deleteMany({
    where: { visit: { organizationId: DEV_ORGANIZATION_ID, patient: NOT_PROTECTED } },
  });
  await prisma.visitExamFindings.deleteMany({
    where: { visit: { organizationId: DEV_ORGANIZATION_ID, patient: NOT_PROTECTED } },
  });
  await prisma.soapNote.deleteMany({
    where: { visit: { organizationId: DEV_ORGANIZATION_ID, patient: NOT_PROTECTED } },
  });
  await prisma.visit.deleteMany({
    where: { organizationId: DEV_ORGANIZATION_ID, patient: NOT_PROTECTED },
  });
  await prisma.appointment.deleteMany({
    where: { organizationId: DEV_ORGANIZATION_ID, ...NOT_PROTECTED },
  });
  await prisma.medicalRecord.deleteMany({
    where: { patient: { organizationId: DEV_ORGANIZATION_ID, ...NOT_PROTECTED } },
  });
  await prisma.patientClient.deleteMany({
    where: { patient: { organizationId: DEV_ORGANIZATION_ID, ...NOT_PROTECTED } },
  });
  await prisma.patient.deleteMany({
    where: { organizationId: DEV_ORGANIZATION_ID, ...NOT_PROTECTED },
  });
  await prisma.client.deleteMany({
    where: { organizationId: DEV_ORGANIZATION_ID, ...NOT_PROTECTED },
  });
}

async function createPatientCase({ client, patient, appointment, visit }) {
  const createdClient = await prisma.client.create({
    data: {
      organizationId: DEV_ORGANIZATION_ID,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      phone: client.phone,
      preferredContactMethod: 'Phone',
    },
  });

  const createdPatient = await prisma.patient.create({
    data: {
      organizationId: DEV_ORGANIZATION_ID,
      name: patient.name,
      species: patient.species,
      breed: patient.breed,
      sex: patient.sex,
      dateOfBirth: dateOfBirth(patient.dateOfBirth),
      weight: patient.weight,
      color: patient.color,
    },
  });

  await prisma.patientClient.create({
    data: {
      patientId: createdPatient.id,
      clientId: createdClient.id,
      isPrimary: true,
    },
  });

  let createdAppointment = null;
  if (appointment) {
    createdAppointment = await prisma.appointment.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        patientId: createdPatient.id,
        clientId: createdClient.id,
        type: appointment.type,
        reason: appointment.reason,
        source: appointment.source ?? 'Phone',
        state: appointment.state,
        scheduledAt: appointment.scheduledAt,
        expectedDurationMinutes: appointment.expectedDurationMinutes ?? 30,
        providerId: appointment.providerId ?? null,
        createdById: 'staff-front-desk-1',
      },
    });
  }

  if (visit) {
    const createdVisit = await prisma.visit.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        patientId: createdPatient.id,
        clientId: createdClient.id,
        appointmentId: visit.linkAppointment ? createdAppointment?.id : undefined,
        visitType: visit.visitType,
        reason: visit.reason,
        state: visit.state,
        createdAt: visit.createdAt,
        currentOwnerId: visit.currentOwnerId ?? 'staff-front-desk-1',
        primaryVeterinarianId: visit.primaryVeterinarianId ?? appointment?.providerId ?? null,
        assignedTechnicianId: visit.assignedTechnicianId ?? null,
        createdById: 'staff-front-desk-1',
        lastUpdatedById: 'staff-front-desk-1',
        nextAction: visit.nextAction,
      },
    });

    if (visit.intakeCompleted) {
      await prisma.visitIntake.create({
        data: {
          visitId: createdVisit.id,
          chiefComplaint: visit.reason,
          historyNotes: 'Reviewed with client at check-in.',
          weight: patient.weight,
          appetite: 'Normal',
          completedAt: visit.createdAt,
        },
      });
    }
  }
}

async function seedDemoCases() {
  const cases = [
    // ── Waiting / Arrived (front-desk + technician queue) ──────────────
    {
      client: { firstName: 'Maria', lastName: 'Alvarez', phone: '555-0104', email: 'maria.alvarez@example.com' },
      patient: {
        name: 'Luna',
        species: 'Canine',
        breed: 'Labrador Retriever',
        sex: 'Female spayed',
        dateOfBirth: '2019-04-12',
        weight: 62.4,
        color: 'Black',
      },
      appointment: {
        type: 'SickVisit',
        reason: 'Vomiting overnight',
        state: 'VisitCreated',
        scheduledAt: todayAt(9, 15),
        expectedDurationMinutes: 40,
        providerId: 'staff-vet-1',
      },
      visit: {
        linkAppointment: true,
        visitType: 'Scheduled',
        reason: 'Vomiting overnight',
        state: 'Arrived',
        nextAction: 'Technician intake',
        createdAt: minutesAgo(7),
        assignedTechnicianId: 'staff-tech-1',
      },
    },
    {
      client: { firstName: 'James', lastName: 'Carter', phone: '555-0188', email: 'james.carter@example.com' },
      patient: {
        name: 'Milo',
        species: 'Feline',
        breed: 'Domestic Shorthair',
        sex: 'Male neutered',
        dateOfBirth: '2021-10-03',
        weight: 11.2,
        color: 'Orange tabby',
      },
      appointment: null,
      visit: {
        linkAppointment: false,
        visitType: 'WalkIn',
        reason: 'Not eating since yesterday',
        state: 'Arrived',
        nextAction: 'Assign room',
        createdAt: minutesAgo(26),
        primaryVeterinarianId: 'staff-vet-2',
        assignedTechnicianId: 'staff-tech-2',
      },
    },
    {
      client: { firstName: 'Evelyn', lastName: 'Brooks', phone: '555-0162', email: 'evelyn.brooks@example.com' },
      patient: {
        name: 'Oliver',
        species: 'Feline',
        breed: 'Maine Coon',
        sex: 'Male neutered',
        dateOfBirth: '2018-12-14',
        weight: 16.1,
        color: 'Brown tabby',
      },
      appointment: {
        type: 'Recheck',
        reason: 'Recheck ear infection',
        state: 'VisitCreated',
        scheduledAt: todayAt(10, 45),
        expectedDurationMinutes: 30,
        providerId: 'staff-vet-1',
      },
      visit: {
        linkAppointment: true,
        visitType: 'Scheduled',
        reason: 'Recheck ear infection',
        state: 'ReadyForIntake',
        nextAction: 'Collect history',
        createdAt: minutesAgo(14),
        assignedTechnicianId: 'staff-tech-1',
      },
    },
    {
      client: { firstName: 'Grace', lastName: 'Kim', phone: '555-0221', email: 'grace.kim@example.com' },
      patient: {
        name: 'Bella',
        species: 'Canine',
        breed: 'Beagle',
        sex: 'Female spayed',
        dateOfBirth: '2020-03-02',
        weight: 24.6,
        color: 'Tricolor',
      },
      appointment: {
        type: 'WellnessPreventiveCare',
        reason: 'Annual checkup',
        state: 'VisitCreated',
        scheduledAt: todayAt(9, 30),
        expectedDurationMinutes: 30,
        providerId: 'staff-vet-1',
      },
      visit: {
        linkAppointment: true,
        visitType: 'Scheduled',
        reason: 'Annual checkup',
        state: 'CheckInInProgress',
        nextAction: 'Complete check-in paperwork',
        createdAt: minutesAgo(4),
        assignedTechnicianId: 'staff-tech-2',
      },
    },
    {
      client: { firstName: 'Daniel', lastName: 'Osei', phone: '555-0247', email: 'daniel.osei@example.com' },
      patient: {
        name: 'Rocky',
        species: 'Canine',
        breed: 'Boxer',
        sex: 'Male neutered',
        dateOfBirth: '2019-08-19',
        weight: 68.3,
        color: 'Fawn',
      },
      appointment: null,
      visit: {
        linkAppointment: false,
        visitType: 'WalkIn',
        reason: 'Limping on front leg',
        state: 'ArrivedWithExceptions',
        nextAction: 'Resolve missing vaccine records',
        createdAt: minutesAgo(19),
        primaryVeterinarianId: 'staff-vet-2',
      },
    },
    {
      client: { firstName: 'Sophia', lastName: 'Nguyen', phone: '555-0263', email: 'sophia.nguyen@example.com' },
      patient: {
        name: 'Coco',
        species: 'Feline',
        breed: 'Siamese',
        sex: 'Female spayed',
        dateOfBirth: '2022-01-27',
        weight: 8.4,
        color: 'Seal point',
      },
      appointment: {
        type: 'SickVisit',
        reason: 'Sneezing and watery eyes',
        state: 'VisitCreated',
        scheduledAt: todayAt(10, 0),
        expectedDurationMinutes: 30,
        providerId: 'staff-vet-2',
      },
      visit: {
        linkAppointment: true,
        visitType: 'Scheduled',
        reason: 'Sneezing and watery eyes',
        state: 'Triaged',
        nextAction: 'Room patient',
        createdAt: minutesAgo(12),
        assignedTechnicianId: 'staff-tech-1',
      },
    },
    {
      client: { firstName: 'Ethan', lastName: 'Walsh', phone: '555-0286', email: 'ethan.walsh@example.com' },
      patient: {
        name: 'Bailey',
        species: 'Canine',
        breed: 'Corgi',
        sex: 'Male neutered',
        dateOfBirth: '2017-11-05',
        weight: 29.1,
        color: 'Red and white',
      },
      appointment: null,
      visit: {
        linkAppointment: false,
        visitType: 'WalkIn',
        reason: 'Itchy skin, scratching a lot',
        state: 'Waiting',
        nextAction: 'Assign technician',
        createdAt: minutesAgo(28),
        primaryVeterinarianId: 'staff-vet-1',
      },
    },

    // ── Exam Ready / Ready for Doctor ───────────────────────────────────
    {
      client: { firstName: 'Isabella', lastName: 'Rossi', phone: '555-0305', email: 'isabella.rossi@example.com' },
      patient: {
        name: 'Charlie',
        species: 'Canine',
        breed: 'Beagle Mix',
        sex: 'Male neutered',
        dateOfBirth: '2016-05-30',
        weight: 21.7,
        color: 'Brown and white',
      },
      appointment: {
        type: 'SickVisit',
        reason: 'Ear infection follow-up',
        state: 'VisitCreated',
        scheduledAt: todayAt(9, 0),
        expectedDurationMinutes: 30,
        providerId: 'staff-vet-1',
      },
      visit: {
        linkAppointment: true,
        visitType: 'Scheduled',
        reason: 'Ear infection follow-up',
        state: 'VeterinarianExamReady',
        nextAction: 'Doctor exam',
        createdAt: minutesAgo(33),
        currentOwnerId: 'staff-tech-1',
        assignedTechnicianId: 'staff-tech-1',
        intakeCompleted: true,
      },
    },
    {
      client: { firstName: 'Liam', lastName: 'Foster', phone: '555-0317', email: 'liam.foster@example.com' },
      patient: {
        name: 'Shadow',
        species: 'Feline',
        breed: 'Domestic Shorthair',
        sex: 'Male neutered',
        dateOfBirth: '2020-09-16',
        weight: 12.8,
        color: 'Black',
      },
      appointment: null,
      visit: {
        linkAppointment: false,
        visitType: 'WalkIn',
        reason: 'Limping on back leg',
        state: 'VeterinarianExamReady',
        nextAction: 'Doctor exam',
        createdAt: minutesAgo(21),
        currentOwnerId: 'staff-tech-2',
        primaryVeterinarianId: 'staff-vet-2',
        assignedTechnicianId: 'staff-tech-2',
        intakeCompleted: true,
      },
    },
    {
      client: { firstName: 'Ava', lastName: 'Martinez', phone: '555-0329', email: 'ava.martinez@example.com' },
      patient: {
        name: 'Rosie',
        species: 'Canine',
        breed: 'Dachshund',
        sex: 'Female spayed',
        dateOfBirth: '2021-02-11',
        weight: 10.9,
        color: 'Red',
      },
      appointment: {
        type: 'Recheck',
        reason: 'Post-surgery recheck',
        state: 'VisitCreated',
        scheduledAt: todayAt(10, 15),
        expectedDurationMinutes: 20,
        providerId: 'staff-vet-1',
      },
      visit: {
        linkAppointment: true,
        visitType: 'Scheduled',
        reason: 'Post-surgery recheck',
        state: 'VeterinarianExamReady',
        nextAction: 'Doctor exam',
        createdAt: minutesAgo(15),
        currentOwnerId: 'staff-tech-1',
        assignedTechnicianId: 'staff-tech-1',
        intakeCompleted: true,
      },
    },
    {
      client: { firstName: 'Mason', lastName: 'Reed', phone: '555-0341', email: 'mason.reed@example.com' },
      patient: {
        name: 'Tucker',
        species: 'Canine',
        breed: 'Australian Shepherd',
        sex: 'Male neutered',
        dateOfBirth: '2018-07-22',
        weight: 52.3,
        color: 'Blue merle',
      },
      appointment: null,
      visit: {
        linkAppointment: false,
        visitType: 'WalkIn',
        reason: 'Seizure witnessed at home',
        state: 'VeterinarianExamReady',
        nextAction: 'Doctor exam — intake summary missing',
        createdAt: minutesAgo(41),
        currentOwnerId: 'staff-tech-2',
        primaryVeterinarianId: 'staff-vet-2',
        assignedTechnicianId: 'staff-tech-2',
        intakeCompleted: false,
      },
    },

    // ── In Progress / Active Visits ─────────────────────────────────────
    {
      client: { firstName: 'Chloe', lastName: 'Adams', phone: '555-0352', email: 'chloe.adams@example.com' },
      patient: {
        name: 'Biscuit',
        species: 'Feline',
        breed: 'Ragdoll',
        sex: 'Female spayed',
        dateOfBirth: '2021-06-08',
        weight: 10.3,
        color: 'Cream point',
      },
      appointment: {
        type: 'WellnessPreventiveCare',
        reason: 'Annual wellness exam',
        state: 'VisitCreated',
        scheduledAt: todayAt(9, 45),
        expectedDurationMinutes: 30,
        providerId: 'staff-vet-1',
      },
      visit: {
        linkAppointment: true,
        visitType: 'Scheduled',
        reason: 'Annual wellness exam',
        state: 'IntakeInProgress',
        nextAction: 'Continue technician intake',
        createdAt: minutesAgo(9),
        currentOwnerId: 'staff-tech-1',
        primaryVeterinarianId: 'staff-vet-1',
        assignedTechnicianId: 'staff-tech-1',
      },
    },
    {
      client: { firstName: 'Lucas', lastName: 'Green', phone: '555-0364', email: 'lucas.green@example.com' },
      patient: {
        name: 'Duke',
        species: 'Canine',
        breed: 'German Shepherd',
        sex: 'Male neutered',
        dateOfBirth: '2017-03-14',
        weight: 74.5,
        color: 'Black and tan',
      },
      appointment: null,
      visit: {
        linkAppointment: false,
        visitType: 'WalkIn',
        reason: 'Ongoing hip stiffness',
        state: 'IntakeInProgress',
        nextAction: 'Continue technician intake',
        createdAt: minutesAgo(6),
        currentOwnerId: 'staff-tech-2',
        primaryVeterinarianId: 'staff-vet-2',
        assignedTechnicianId: 'staff-tech-2',
      },
    },
    {
      client: { firstName: 'Harper', lastName: 'Collins', phone: '555-0376', email: 'harper.collins@example.com' },
      patient: {
        name: 'Willow',
        species: 'Canine',
        breed: 'Border Collie',
        sex: 'Female spayed',
        dateOfBirth: '2019-01-09',
        weight: 38.2,
        color: 'Black and white',
      },
      appointment: {
        type: 'SickVisit',
        reason: 'Persistent cough',
        state: 'VisitCreated',
        scheduledAt: todayAt(9, 0),
        expectedDurationMinutes: 30,
        providerId: 'staff-vet-1',
      },
      visit: {
        linkAppointment: true,
        visitType: 'Scheduled',
        reason: 'Persistent cough',
        state: 'VeterinarianExamInProgress',
        nextAction: 'Doctor completing exam',
        createdAt: minutesAgo(24),
        currentOwnerId: 'staff-vet-1',
        assignedTechnicianId: 'staff-tech-1',
      },
    },
    {
      client: { firstName: 'Benjamin', lastName: 'Cruz', phone: '555-0388', email: 'benjamin.cruz@example.com' },
      patient: {
        name: 'Simba',
        species: 'Feline',
        breed: 'Bengal',
        sex: 'Male neutered',
        dateOfBirth: '2020-04-25',
        weight: 13.6,
        color: 'Spotted brown',
      },
      appointment: null,
      visit: {
        linkAppointment: false,
        visitType: 'WalkIn',
        reason: 'Laceration on paw, cleaning and bandaging',
        state: 'TreatmentInProgress',
        nextAction: 'Complete wound treatment',
        createdAt: minutesAgo(38),
        currentOwnerId: 'staff-vet-2',
        assignedTechnicianId: 'staff-tech-2',
      },
    },
    {
      client: { firstName: 'Amelia', lastName: 'Ward', phone: '555-0392', email: 'amelia.ward@example.com' },
      patient: {
        name: 'Zeus',
        species: 'Canine',
        breed: 'Rottweiler',
        sex: 'Male neutered',
        dateOfBirth: '2016-10-17',
        weight: 96.8,
        color: 'Black and tan',
      },
      appointment: {
        type: 'SickVisit',
        reason: 'Lethargy and reduced appetite',
        state: 'VisitCreated',
        scheduledAt: todayAt(8, 45),
        expectedDurationMinutes: 40,
        providerId: 'staff-vet-1',
      },
      visit: {
        linkAppointment: true,
        visitType: 'Scheduled',
        reason: 'Lethargy and reduced appetite',
        state: 'DiagnosticsInProgress',
        nextAction: 'Awaiting bloodwork results',
        createdAt: minutesAgo(52),
        currentOwnerId: 'staff-vet-1',
      },
    },

    // ── Ready for Checkout ───────────────────────────────────────────────
    {
      client: { firstName: 'Jack', lastName: 'Sullivan', phone: '555-0403', email: 'jack.sullivan@example.com' },
      patient: {
        name: 'Maggie',
        species: 'Canine',
        breed: 'Cavalier King Charles Spaniel',
        sex: 'Female spayed',
        dateOfBirth: '2019-12-01',
        weight: 16.4,
        color: 'Blenheim',
      },
      appointment: {
        type: 'Vaccination',
        reason: 'Annual vaccines',
        state: 'VisitCreated',
        scheduledAt: todayAt(8, 30),
        expectedDurationMinutes: 25,
        providerId: 'staff-vet-2',
      },
      visit: {
        linkAppointment: true,
        visitType: 'Scheduled',
        reason: 'Annual vaccines',
        state: 'CheckoutReady',
        nextAction: 'Collect payment and close visit',
        createdAt: minutesAgo(61),
        currentOwnerId: 'staff-front-desk-1',
        primaryVeterinarianId: 'staff-vet-2',
      },
    },
    {
      client: { firstName: 'Ella', lastName: 'Torres', phone: '555-0415', email: 'ella.torres@example.com' },
      patient: {
        name: 'Oscar',
        species: 'Feline',
        breed: 'British Shorthair',
        sex: 'Male neutered',
        dateOfBirth: '2018-02-19',
        weight: 14.7,
        color: 'Blue',
      },
      appointment: null,
      visit: {
        linkAppointment: false,
        visitType: 'WalkIn',
        reason: 'Nail trim and wellness check',
        state: 'CheckoutReady',
        nextAction: 'Collect payment and close visit',
        createdAt: minutesAgo(70),
        currentOwnerId: 'staff-front-desk-1',
        primaryVeterinarianId: 'staff-vet-1',
      },
    },
    {
      client: { firstName: 'Henry', lastName: 'Diaz', phone: '555-0427', email: 'henry.diaz@example.com' },
      patient: {
        name: 'Ziggy',
        species: 'Canine',
        breed: 'Shih Tzu',
        sex: 'Male neutered',
        dateOfBirth: '2020-08-30',
        weight: 12.1,
        color: 'Gold and white',
      },
      appointment: {
        type: 'Recheck',
        reason: 'Dental recheck',
        state: 'VisitCreated',
        scheduledAt: todayAt(8, 15),
        expectedDurationMinutes: 20,
        providerId: 'staff-vet-2',
      },
      visit: {
        linkAppointment: true,
        visitType: 'Scheduled',
        reason: 'Dental recheck',
        state: 'CheckoutInProgress',
        nextAction: 'Finish processing payment',
        createdAt: minutesAgo(75),
        currentOwnerId: 'staff-front-desk-1',
        primaryVeterinarianId: 'staff-vet-2',
      },
    },

    // ── Completed Today (appointment history, visit already closed) ─────
    {
      client: { firstName: 'Zoe', lastName: 'Bennett', phone: '555-0438', email: 'zoe.bennett@example.com' },
      patient: {
        name: 'Pumpkin',
        species: 'Feline',
        breed: 'Domestic Longhair',
        sex: 'Female spayed',
        dateOfBirth: '2019-10-31',
        weight: 11.9,
        color: 'Orange',
      },
      appointment: {
        type: 'WellnessPreventiveCare',
        reason: 'Annual wellness exam',
        state: 'Completed',
        scheduledAt: todayAt(8, 0),
        expectedDurationMinutes: 30,
        providerId: 'staff-vet-1',
      },
      visit: null,
    },
    {
      client: { firstName: 'Ryan', lastName: 'Phillips', phone: '555-0441', email: 'ryan.phillips@example.com' },
      patient: {
        name: 'Cooper',
        species: 'Canine',
        breed: 'Labrador Retriever',
        sex: 'Male neutered',
        dateOfBirth: '2020-01-15',
        weight: 66.0,
        color: 'Yellow',
      },
      appointment: {
        type: 'Vaccination',
        reason: 'Booster vaccines',
        state: 'Completed',
        scheduledAt: todayAt(8, 30),
        expectedDurationMinutes: 20,
        providerId: 'staff-vet-2',
      },
      visit: null,
    },
    {
      client: { firstName: 'Natalie', lastName: 'Brooks', phone: '555-0453', email: 'natalie.brooks@example.com' },
      patient: {
        name: 'Misty',
        species: 'Feline',
        breed: 'Domestic Shorthair',
        sex: 'Female spayed',
        dateOfBirth: '2021-03-27',
        weight: 9.2,
        color: 'Gray tabby',
      },
      appointment: {
        type: 'SickVisit',
        reason: 'Mild upper respiratory infection',
        state: 'Completed',
        scheduledAt: todayAt(9, 0),
        expectedDurationMinutes: 25,
        providerId: 'staff-vet-1',
      },
      visit: null,
    },
    {
      client: { firstName: 'Owen', lastName: 'Kelly', phone: '555-0465', email: 'owen.kelly@example.com' },
      patient: {
        name: 'Buddy',
        species: 'Canine',
        breed: 'Beagle',
        sex: 'Male neutered',
        dateOfBirth: '2018-05-06',
        weight: 22.8,
        color: 'Tricolor',
      },
      appointment: {
        type: 'Recheck',
        reason: 'Post-dental recheck',
        state: 'Completed',
        scheduledAt: todayAt(9, 30),
        expectedDurationMinutes: 20,
        providerId: 'staff-vet-2',
      },
      visit: null,
    },

    // ── Upcoming Appointments (scheduled later, no visit yet) ───────────
    {
      client: { firstName: 'Priya', lastName: 'Deshmukh', phone: '555-0149', email: 'priya.deshmukh@example.com' },
      patient: {
        name: 'Pepper',
        species: 'Canine',
        breed: 'Poodle Mix',
        sex: 'Female spayed',
        dateOfBirth: '2020-06-21',
        weight: 18.7,
        color: 'Gray',
      },
      appointment: {
        type: 'Vaccination',
        reason: 'Annual vaccines',
        state: 'Scheduled',
        scheduledAt: hoursFromNow(1),
        expectedDurationMinutes: 25,
        providerId: 'staff-vet-2',
      },
      visit: null,
    },
    {
      client: { firstName: 'Chris', lastName: 'Watson', phone: '555-0472', email: 'chris.watson@example.com' },
      patient: {
        name: 'Nala',
        species: 'Feline',
        breed: 'Maine Coon',
        sex: 'Female spayed',
        dateOfBirth: '2019-09-13',
        weight: 15.3,
        color: 'Brown tabby',
      },
      appointment: {
        type: 'WellnessPreventiveCare',
        reason: 'Annual wellness exam',
        state: 'Scheduled',
        scheduledAt: hoursFromNow(2),
        expectedDurationMinutes: 30,
        providerId: 'staff-vet-1',
      },
      visit: null,
    },
    {
      client: { firstName: 'Megan', lastName: 'Hayes', phone: '555-0484', email: 'megan.hayes@example.com' },
      patient: {
        name: 'Cody',
        species: 'Canine',
        breed: 'Vizsla',
        sex: 'Male neutered',
        dateOfBirth: '2021-05-02',
        weight: 45.6,
        color: 'Rust',
      },
      appointment: {
        type: 'Vaccination',
        reason: 'Booster vaccines',
        state: 'Confirmed',
        scheduledAt: hoursFromNow(3),
        expectedDurationMinutes: 20,
        providerId: 'staff-vet-2',
      },
      visit: null,
    },
    {
      client: { firstName: 'Tyler', lastName: 'Brooks', phone: '555-0496', email: 'tyler.brooks@example.com' },
      patient: {
        name: 'Peanut',
        species: 'Canine',
        breed: 'Chihuahua',
        sex: 'Male neutered',
        dateOfBirth: '2022-02-14',
        weight: 5.4,
        color: 'Fawn',
      },
      appointment: {
        type: 'SickVisit',
        reason: 'Occasional vomiting',
        state: 'PreVisitPending',
        scheduledAt: hoursFromNow(4),
        expectedDurationMinutes: 30,
        providerId: 'staff-vet-1',
      },
      visit: null,
    },
    {
      client: { firstName: 'Olivia', lastName: 'Price', phone: '555-0508', email: 'olivia.price@example.com' },
      patient: {
        name: 'Gizmo',
        species: 'Feline',
        breed: 'Sphynx',
        sex: 'Male neutered',
        dateOfBirth: '2020-11-22',
        weight: 8.9,
        color: 'Pink/gray',
      },
      appointment: {
        type: 'Recheck',
        reason: 'Skin condition recheck',
        state: 'Scheduled',
        scheduledAt: hoursFromNow(5),
        expectedDurationMinutes: 20,
        providerId: 'staff-vet-2',
      },
      visit: null,
    },
    {
      client: { firstName: 'Samuel', lastName: 'Ortiz', phone: '555-0512', email: 'samuel.ortiz@example.com' },
      patient: {
        name: 'Max',
        species: 'Canine',
        breed: 'Pit Bull Mix',
        sex: 'Male neutered',
        dateOfBirth: '2019-07-08',
        weight: 58.2,
        color: 'Brindle',
      },
      appointment: {
        type: 'TechnicianAppointment',
        reason: 'Nail trim and ear cleaning',
        state: 'Confirmed',
        scheduledAt: hoursFromNow(6),
        expectedDurationMinutes: 20,
        providerId: 'staff-vet-1',
      },
      visit: null,
    },

    // ── No appointment or visit yet (pure patient record, for search) ───
    {
      client: { firstName: 'Noah', lastName: 'Bennett', phone: '555-0192', email: 'noah.bennett@example.com' },
      patient: {
        name: 'Daisy',
        species: 'Canine',
        breed: 'Golden Retriever',
        sex: 'Female spayed',
        dateOfBirth: '2017-02-08',
        weight: 71.8,
        color: 'Golden',
      },
      appointment: null,
      visit: null,
    },
  ];

  for (const patientCase of cases) {
    await createPatientCase(patientCase);
  }
}

async function seedMessaging() {
  const roster = await prisma.user.findMany({ where: { organizationId: DEV_ORGANIZATION_ID, isActive: true, role: { not: 'CLIENT' } }, orderBy: { createdAt: 'asc' } });
  const receptionist = roster.find((user) => user.role === 'RECEPTIONIST') ?? roster[0];
  const vets = roster.filter((user) => user.role === 'VETERINARIAN');
  const techs = roster.filter((user) => user.role === 'TECHNICIAN' || user.role === 'ASSISTANT');
  const currentUser = roster.find((user) => user.id === 'dev-user') ?? receptionist;
  if (!receptionist || !currentUser) return;

  async function conversation({ id, type, name, description, members, messages }) {
    const uniqueMembers = [...new Set([currentUser.id, ...members.map((member) => member.id)])];
    const lastMessageAt = minutesAgo(messages.at(-1)?.minutesAgo ?? 1);
    const row = await prisma.messagingConversation.upsert({ where: { id }, update: { type, name, description, lastMessageAt }, create: { id, organizationId: DEV_ORGANIZATION_ID, locationId: type.includes('CHANNEL') ? DEV_LOCATION_ID : null, type, name, description, createdById: currentUser.id, lastMessageAt } });
    for (const userId of uniqueMembers) await prisma.messagingConversationMember.upsert({ where: { conversationId_userId: { conversationId: row.id, userId } }, update: { isArchived: false }, create: { organizationId: DEV_ORGANIZATION_ID, conversationId: row.id, userId, lastReadAt: userId === currentUser.id ? minutesAgo(18) : new Date() } });
    for (const [index, message] of messages.entries()) await prisma.messagingMessage.upsert({ where: { conversationId_clientNonce: { conversationId: row.id, clientNonce: `${id}-${index + 1}` } }, update: { body: message.body, senderId: message.sender.id, createdAt: minutesAgo(message.minutesAgo) }, create: { organizationId: DEV_ORGANIZATION_ID, conversationId: row.id, senderId: message.sender.id, clientNonce: `${id}-${index + 1}`, body: message.body, createdAt: minutesAgo(message.minutesAgo) } });
  }

  await conversation({ id: 'demo-messaging-clinic-channel', type: 'CLINIC_CHANNEL', name: 'Main Hospital', description: 'Clinic-wide updates and announcements', members: roster, messages: [
    { sender: vets[0] ?? receptionist, minutesAgo: 95, body: 'Good morning, team. The dental suite is back in service and all monitoring equipment passed its check.' },
    { sender: techs[0] ?? receptionist, minutesAgo: 88, body: 'Perfect — I moved Luna’s setup back to dental and updated the treatment board.' },
    { sender: receptionist, minutesAgo: 42, body: 'Reminder: the 2:30 wellness appointment asked to arrive early. I’ll check them in as soon as they’re here.' },
    { sender: vets[1] ?? vets[0] ?? receptionist, minutesAgo: 12, body: 'Thanks. I’m finishing rounds now and can pick up the next exam after that.' },
  ] });

  await conversation({ id: 'demo-messaging-treatment-team', type: 'DEPARTMENT_CHANNEL', name: 'Treatment Team', description: 'Technician and veterinarian handoffs', members: [...vets, ...techs], messages: [
    { sender: techs[1] ?? techs[0] ?? receptionist, minutesAgo: 64, body: 'Bailey’s blood draw is complete. Samples are labeled and in the pickup bin.' },
    { sender: vets[0] ?? receptionist, minutesAgo: 59, body: 'Thank you. I added the requested panel and will review results between appointments.' },
    { sender: techs[0] ?? receptionist, minutesAgo: 31, body: 'Milo is comfortable after his injection. Recheck vitals are normal and he’s ready for discharge instructions.' },
    { sender: vets[0] ?? receptionist, minutesAgo: 24, body: 'Great handoff. I’ll speak with his family before they head out.' },
  ] });

  await conversation({ id: 'demo-messaging-lunch-coverage', type: 'PRIVATE_CHANNEL', name: 'Lunch coverage', description: 'Front desk and floor coverage today', members: [receptionist, techs[0], vets[0]].filter(Boolean), messages: [
    { sender: receptionist, minutesAgo: 36, body: 'Could someone cover the front for ten minutes around 12:30 while I call back the pharmacy?' },
    { sender: techs[0] ?? receptionist, minutesAgo: 33, body: 'I can cover after I finish this intake.' },
    { sender: vets[0] ?? receptionist, minutesAgo: 29, body: 'Works for me. I’ll keep an ear on treatment if anything comes up.' },
    { sender: receptionist, minutesAgo: 26, body: 'Thank you both — that keeps everything moving.' },
  ] });

  const directPartner = techs[0] ?? vets[0] ?? roster.find((user) => user.id !== currentUser.id);
  if (directPartner) await conversation({ id: 'demo-messaging-direct-intake', type: 'DIRECT', name: null, description: null, members: [directPartner], messages: [
    { sender: currentUser, minutesAgo: 19, body: 'The Carter family just arrived with Bailey. Are you ready for intake?' },
    { sender: directPartner, minutesAgo: 16, body: 'Yes — room two is clean. I’ll meet them up front.' },
    { sender: currentUser, minutesAgo: 14, body: 'Perfect, I’m checking them in now.' },
  ] });
}

// Demo clients carry 7-digit fictional numbers; a texting conversation is
// keyed by a complete number, so give the demo clients one (555-01xx style
// numbers are reserved for fiction and can never reach a real phone).
function demoTextingPhone(phone) {
  const digits = String(phone ?? '').replace(/[^0-9]/g, '');
  if (digits.length !== 7) return null;
  return { display: `(312) ${digits.slice(0, 3)}-${digits.slice(3)}`, e164: `+1312${digits}` };
}

// Simulation data only: every message is stored as SIMULATED, exactly as the
// API stores a message at a location with no registered texting number.
async function seedClientCommunication() {
  const clients = await prisma.client.findMany({ where: { organizationId: DEV_ORGANIZATION_ID, phone: { not: null } }, include: { patients: { include: { patient: true }, take: 1 } }, orderBy: { createdAt: 'asc' }, take: 5 });
  const staff = await prisma.user.findFirst({ where: { organizationId: DEV_ORGANIZATION_ID, role: 'RECEPTIONIST', isActive: true } });
  const scripts = [
    ['Hi! Just confirming Bailey’s appointment for tomorrow at 9:30 AM.', 'Yes, that still works for us. Thank you!', 'Perfect — we’ll see you and Bailey tomorrow morning.'],
    ['Milo is ready to head home. Dr. Shah would like to review his discharge instructions with you.', 'Great, I can be there in about 20 minutes.', 'Sounds good. We’ll have everything ready at the front desk.'],
    ['We received Luna’s lab results and the doctor has reviewed them.', 'Is everything okay?', 'Nothing urgent. Dr. Brennan will call this afternoon to walk through the results with you.'],
    ['Friendly reminder that Cooper is due for a wellness visit this month. Would you like help finding a time?', 'Do you have anything Friday afternoon?', 'Yes — we have 2:00 PM and 3:30 PM available.'],
    ['How is Daisy doing after yesterday’s visit?', 'Much better today. She ate breakfast and seems comfortable.', 'That’s wonderful to hear. Please call us if anything changes.'],
  ];
  for (const [index, client] of clients.entries()) {
    const phone = demoTextingPhone(client.phone);
    if (!phone) continue;
    const patient = client.patients[0]?.patient;
    const threadId = `demo-client-communication-${index + 1}`;
    const messages = scripts[index] ?? scripts[0];
    await prisma.clientCommunicationThread.deleteMany({ where: { OR: [{ id: threadId }, { locationId: DEV_LOCATION_ID, contactPhoneE164: phone.e164 }] } });
    await prisma.client.update({ where: { id: client.id }, data: { phone: phone.display, phoneE164: phone.e164 } });
    const consent = { status: 'GRANTED', basis: 'STAFF_RECORDED', method: 'VERBAL', clientId: client.id };
    await prisma.clientTextingConsent.upsert({ where: { organizationId_phoneE164: { organizationId: DEV_ORGANIZATION_ID, phoneE164: phone.e164 } }, update: { ...consent, recordedById: staff?.id ?? null }, create: { organizationId: DEV_ORGANIZATION_ID, phoneE164: phone.e164, ...consent, recordedById: staff?.id ?? null } });
    await prisma.clientTextingConsentEvent.create({ data: { organizationId: DEV_ORGANIZATION_ID, phoneE164: phone.e164, ...consent, actorUserId: staff?.id ?? null } });
    await prisma.clientCommunicationThread.create({ data: { id: threadId, organizationId: DEV_ORGANIZATION_ID, locationId: DEV_LOCATION_ID, contactPhoneE164: phone.e164, clientId: client.id, assignedToId: staff?.id ?? null, status: index === 2 ? 'OPEN' : 'WAITING', unreadCount: index === 2 ? 1 : 0 } });
    let last;
    for (const [messageIndex, body] of messages.entries()) {
      const outbound = messageIndex % 2 === 0;
      last = await prisma.clientCommunicationMessage.create({ data: { organizationId: DEV_ORGANIZATION_ID, locationId: DEV_LOCATION_ID, threadId, direction: outbound ? 'OUTBOUND' : 'INBOUND', source: outbound ? 'STAFF' : 'CLIENT', status: 'SIMULATED', provider: 'SIMULATED', body, senderUserId: outbound ? staff?.id ?? null : null, clientId: client.id, patientId: patient?.id ?? null, fromE164: outbound ? null : phone.e164, toE164: outbound ? phone.e164 : null, segments: 1, createdAt: minutesAgo(30 - messageIndex * 4 + index * 10) } });
    }
    // The unread conversation ends on the client's question, not the reply.
    if (index === 2) await prisma.clientCommunicationMessage.delete({ where: { id: last.id } });
    const newest = await prisma.clientCommunicationMessage.findFirst({ where: { threadId }, orderBy: { createdAt: 'desc' } });
    const newestInbound = await prisma.clientCommunicationMessage.findFirst({ where: { threadId, direction: 'INBOUND' }, orderBy: { createdAt: 'desc' } });
    await prisma.clientCommunicationThread.update({ where: { id: threadId }, data: { lastMessageId: newest.id, lastMessageAt: newest.createdAt, lastInboundAt: newestInbound?.createdAt ?? null } });
  }
}

async function main() {
  await ensureDevClinic();
  await clearDevClinicalData();
  await seedDemoCases();
  await seedMessaging();
  await seedClientCommunication();

  const [staff, clients, patients, appointments, visits] = await Promise.all([
    prisma.user.count({ where: { organizationId: DEV_ORGANIZATION_ID } }),
    prisma.client.count({ where: { organizationId: DEV_ORGANIZATION_ID } }),
    prisma.patient.count({ where: { organizationId: DEV_ORGANIZATION_ID } }),
    prisma.appointment.count({ where: { organizationId: DEV_ORGANIZATION_ID } }),
    prisma.visit.count({ where: { organizationId: DEV_ORGANIZATION_ID } }),
  ]);

  console.log(
    `Seeded Sparki dev clinic: ${staff} staff, ${clients} clients, ${patients} patients, ${appointments} appointments, ${visits} visits.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
