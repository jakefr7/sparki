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

function dateOfBirth(isoDate) {
  return new Date(`${isoDate}T12:00:00.000Z`);
}

// Fixed, well-known IDs (not generated cuids) so repeated runs upsert the
// same rows instead of accumulating duplicates.
const STAFF = [
  {
    id: 'staff-owner',
    firstName: 'Renee',
    lastName: 'Castillo',
    email: 'renee.castillo@sparkidemo.vet',
    role: 'OWNER',
    jobTitle: 'Hospital Owner',
    canReceiveAppointments: false,
    canOwnVisits: false,
    color: '#7C3AED',
  },
  {
    id: 'staff-practice-manager',
    firstName: 'Dana',
    lastName: 'Whitfield',
    email: 'dana.whitfield@sparkidemo.vet',
    role: 'PRACTICE_MANAGER',
    jobTitle: 'Practice Manager',
    canReceiveAppointments: false,
    canOwnVisits: false,
    color: '#0EA5E9',
  },
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
    id: 'staff-front-desk-2',
    firstName: 'Lauren',
    lastName: 'Obi',
    email: 'lauren.obi@sparkidemo.vet',
    role: 'FRONT_DESK',
    jobTitle: 'Front Desk Coordinator',
    canReceiveAppointments: false,
    canOwnVisits: true,
    color: '#F97316',
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
  {
    id: 'staff-tech-3',
    firstName: 'Sofia',
    lastName: 'Ramirez',
    email: 'sofia.ramirez@sparkidemo.vet',
    role: 'TECHNICIAN',
    jobTitle: 'Veterinary Technician',
    canReceiveAppointments: true,
    canOwnVisits: true,
    color: '#EA580C',
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
    await prisma.visit.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        patientId: createdPatient.id,
        clientId: createdClient.id,
        appointmentId: visit.linkAppointment ? createdAppointment?.id : undefined,
        visitType: visit.visitType,
        reason: visit.reason,
        state: visit.state,
        currentOwnerId: visit.currentOwnerId ?? 'staff-front-desk-1',
        primaryVeterinarianId: visit.primaryVeterinarianId ?? appointment?.providerId ?? null,
        assignedTechnicianId: visit.assignedTechnicianId ?? null,
        createdById: 'staff-front-desk-1',
        lastUpdatedById: 'staff-front-desk-1',
        nextAction: visit.nextAction,
      },
    });
  }
}

async function seedDemoCases() {
  const cases = [
    {
      client: {
        firstName: 'Maria',
        lastName: 'Alvarez',
        phone: '555-0104',
        email: 'maria.alvarez@example.com',
      },
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
        assignedTechnicianId: 'staff-tech-1',
      },
    },
    {
      client: {
        firstName: 'James',
        lastName: 'Carter',
        phone: '555-0188',
        email: 'james.carter@example.com',
      },
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
        primaryVeterinarianId: 'staff-vet-2',
        assignedTechnicianId: 'staff-tech-2',
      },
    },
    {
      client: {
        firstName: 'Priya',
        lastName: 'Deshmukh',
        phone: '555-0149',
        email: 'priya.deshmukh@example.com',
      },
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
        scheduledAt: todayAt(14, 30),
        expectedDurationMinutes: 25,
        providerId: 'staff-vet-2',
      },
      visit: null,
    },
    {
      client: {
        firstName: 'Noah',
        lastName: 'Bennett',
        phone: '555-0192',
        email: 'noah.bennett@example.com',
      },
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
    {
      client: {
        firstName: 'Evelyn',
        lastName: 'Brooks',
        phone: '555-0162',
        email: 'evelyn.brooks@example.com',
      },
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
        assignedTechnicianId: 'staff-tech-3',
      },
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
