import prismaClientPackage from '../packages/db/generated/client/index.js';

const { PrismaClient } = prismaClientPackage;
const prisma = new PrismaClient();

const DEV_ORGANIZATION_ID = 'dev-organization';
const DEV_LOCATION_ID = 'dev-location';

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
    role: 'FRONT_DESK',
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
  await prisma.visitIntake.deleteMany({
    where: { visit: { organizationId: DEV_ORGANIZATION_ID } },
  });
  await prisma.visitExamFindings.deleteMany({
    where: { visit: { organizationId: DEV_ORGANIZATION_ID } },
  });
  await prisma.soapNote.deleteMany({
    where: { visit: { organizationId: DEV_ORGANIZATION_ID } },
  });
  await prisma.visit.deleteMany({
    where: { organizationId: DEV_ORGANIZATION_ID },
  });
  await prisma.appointment.deleteMany({
    where: { organizationId: DEV_ORGANIZATION_ID },
  });
  await prisma.medicalRecord.deleteMany({
    where: { patient: { organizationId: DEV_ORGANIZATION_ID } },
  });
  await prisma.patientClient.deleteMany({
    where: { patient: { organizationId: DEV_ORGANIZATION_ID } },
  });
  await prisma.patient.deleteMany({
    where: { organizationId: DEV_ORGANIZATION_ID },
  });
  await prisma.client.deleteMany({
    where: { organizationId: DEV_ORGANIZATION_ID },
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

async function main() {
  await ensureDevClinic();
  await clearDevClinicalData();
  await seedDemoCases();

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
