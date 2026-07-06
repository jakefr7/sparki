import prismaClientPackage from '../packages/db/generated/client/index.js';

const { PrismaClient } = prismaClientPackage;
const prisma = new PrismaClient();

const DEV_ORGANIZATION_ID = 'dev-organization';
const DEV_LOCATION_ID = 'dev-location';
const DEV_USER_ID = 'dev-user';

function todayAt(hour, minute) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

function dateOfBirth(isoDate) {
  return new Date(`${isoDate}T12:00:00.000Z`);
}

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

  const roleNames = ['Receptionist', 'Technician', 'Veterinarian', 'Practice Manager'];
  const roles = [];
  for (const name of roleNames) {
    roles.push(
      await prisma.role.upsert({
        where: { organizationId_name: { organizationId: organization.id, name } },
        update: {},
        create: { organizationId: organization.id, name },
      }),
    );
  }

  await prisma.user.upsert({
    where: { id: DEV_USER_ID },
    update: {
      organizationId: organization.id,
      email: 'dev@sparki.local',
      name: 'Development User',
      locations: { set: [{ id: location.id }] },
      roles: { set: roles.map((role) => ({ id: role.id })) },
    },
    create: {
      id: DEV_USER_ID,
      organizationId: organization.id,
      email: 'dev@sparki.local',
      name: 'Development User',
      locations: { connect: [{ id: location.id }] },
      roles: { connect: roles.map((role) => ({ id: role.id })) },
    },
  });
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
        createdById: DEV_USER_ID,
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
        currentOwnerId: DEV_USER_ID,
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
      },
      visit: {
        linkAppointment: true,
        visitType: 'Scheduled',
        reason: 'Vomiting overnight',
        state: 'Arrived',
        nextAction: 'Technician intake',
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
      },
    },
    {
      client: {
        firstName: 'Priya',
        lastName: 'Shah',
        phone: '555-0149',
        email: 'priya.shah@example.com',
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
      },
      visit: {
        linkAppointment: true,
        visitType: 'Scheduled',
        reason: 'Recheck ear infection',
        state: 'ReadyForIntake',
        nextAction: 'Collect history',
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

  const [clients, patients, appointments, visits] = await Promise.all([
    prisma.client.count({ where: { organizationId: DEV_ORGANIZATION_ID } }),
    prisma.patient.count({ where: { organizationId: DEV_ORGANIZATION_ID } }),
    prisma.appointment.count({ where: { organizationId: DEV_ORGANIZATION_ID } }),
    prisma.visit.count({ where: { organizationId: DEV_ORGANIZATION_ID } }),
  ]);

  console.log(
    `Seeded Sparki dev clinic: ${clients} clients, ${patients} patients, ${appointments} appointments, ${visits} visits.`,
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
