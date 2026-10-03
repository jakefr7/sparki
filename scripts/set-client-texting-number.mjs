// Sets how one clinic location texts — the ClientMessagingChannel row
// described in docs/engineering/client-communication-backend.md.
//
// A location with no row has no texting at all: its Communication tab stays
// hidden. This script is how an operator changes that:
// - a real number starts PENDING (tab still hidden, sending refused, inbound
//   recorded) and is set ACTIVE only once the carrier registration for that
//   clinic is approved — that is the moment the clinic starts texting real
//   phones;
// - --simulate marks a demo or test clinic, whose messages are saved and
//   labelled but never sent.
//
// Usage (from the repo root; reads DATABASE_URL from the environment):
//   dotenv -e .env -- node scripts/set-client-texting-number.mjs \
//     --location <locationId> --number "+13125550100" \
//     [--profile <telnyx messaging profile id>] \
//     [--status PENDING|ACTIVE|SUSPENDED] [--reason "why it is not active"]
//   dotenv -e .env -- node scripts/set-client-texting-number.mjs \
//     --location <locationId> --simulate
//   dotenv -e .env -- node scripts/set-client-texting-number.mjs \
//     --location <locationId> --remove
import prismaClientPackage from '../packages/db/generated/client/index.js';

const { PrismaClient } = prismaClientPackage;
const prisma = new PrismaClient();

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const locationId = option('location');
  if (!locationId) throw new Error('--location <locationId> is required.');
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    include: { organization: { select: { name: true } } },
  });
  if (!location) throw new Error(`No location with id ${locationId}.`);
  const label = `${location.organization.name} / ${location.name}`;

  if (process.argv.includes('--remove')) {
    const removed = await prisma.clientMessagingChannel.deleteMany({ where: { locationId } });
    console.log(
      removed.count
        ? `${label}: texting removed; the Communication tab is now hidden for this location.`
        : `${label}: texting was not set up.`,
    );
    return;
  }

  if (process.argv.includes('--simulate')) {
    const simulated = {
      provider: 'SIMULATED',
      senderPhoneE164: null,
      providerProfileId: null,
      status: 'ACTIVE',
      statusReason: null,
    };
    await prisma.clientMessagingChannel.upsert({
      where: { locationId },
      create: { organizationId: location.organizationId, locationId, ...simulated },
      update: simulated,
    });
    console.log(`${label}: texting is simulated. Messages are saved and labelled, never sent.`);
    return;
  }

  const number = option('number');
  if (!number || !/^\+1[2-9][0-9]{2}[2-9][0-9]{6}$/.test(number)) {
    throw new Error('--number must be a US/Canada number in E.164 form, e.g. +13125550100.');
  }
  const status = option('status') ?? 'PENDING';
  if (!['PENDING', 'ACTIVE', 'SUSPENDED'].includes(status)) {
    throw new Error('--status must be PENDING, ACTIVE, or SUSPENDED.');
  }
  const fields = {
    provider: 'TELNYX',
    senderPhoneE164: number,
    providerProfileId: option('profile') ?? null,
    status,
    statusReason: option('reason') ?? null,
  };
  const channel = await prisma.clientMessagingChannel.upsert({
    where: { locationId },
    create: { organizationId: location.organizationId, locationId, ...fields },
    update: fields,
  });
  console.log(`${label}: texting number ${channel.senderPhoneE164} is ${channel.status}.`);
  if (channel.status === 'ACTIVE') {
    console.log(
      'Staff messages from this location are now sent to real phones (when TELNYX_API_KEY and TELNYX_PUBLIC_KEY are set).',
    );
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
