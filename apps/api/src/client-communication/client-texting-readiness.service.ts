import { Injectable } from '@nestjs/common';
import { prisma, type ClientMessagingChannel, type Prisma } from '@sparki/db';
import { TelnyxSmsProvider } from './providers/telnyx-sms.provider';

type Db = Prisma.TransactionClient | typeof prisma;

export type TextingUnavailableCode =
  'REGISTRATION_PENDING' | 'SENDER_SUSPENDED' | 'PROVIDER_NOT_CONFIGURED';

/** A real, approved channel always has the number clients text. */
export type LiveChannel = ClientMessagingChannel & { senderPhoneE164: string };

/**
 * Whether a clinic location can text, and whether those texts leave Sparki.
 * - NOT_SET_UP: no texting number has been registered. The Communication tab
 *   is hidden and nothing can be sent (founder decision 2026-10-02).
 * - SIMULATED: a demo or test clinic. Messages are saved and labelled as
 *   simulated; nothing is sent.
 * - LIVE: an approved sender number and working provider credentials.
 * - UNAVAILABLE: a real number exists but cannot send right now (awaiting
 *   carrier approval, suspended). Sending is refused — never quietly
 *   downgraded to simulation, which would let a real clinic believe it had
 *   reached a client.
 */
export type TextingReadiness =
  | { mode: 'NOT_SET_UP'; channel: null }
  | { mode: 'SIMULATED'; channel: ClientMessagingChannel }
  | { mode: 'LIVE'; channel: LiveChannel }
  | {
      mode: 'UNAVAILABLE';
      channel: ClientMessagingChannel;
      code: TextingUnavailableCode;
      reason: string;
    };

/** Staff see the Communication tab only where texting works, for real or in simulation. */
export function isTextingVisible(readiness: TextingReadiness): boolean {
  return readiness.mode === 'LIVE' || readiness.mode === 'SIMULATED';
}

@Injectable()
export class ClientTextingReadinessService {
  constructor(private readonly telnyx: TelnyxSmsProvider) {}

  async forLocation(
    organizationId: string,
    locationId: string,
    db: Db = prisma,
  ): Promise<TextingReadiness> {
    const channel = await db.clientMessagingChannel.findFirst({
      where: { organizationId, locationId },
    });
    return this.forChannel(channel);
  }

  forChannel(channel: ClientMessagingChannel | null): TextingReadiness {
    if (!channel) return { mode: 'NOT_SET_UP', channel: null };
    if (channel.provider === 'SIMULATED') return { mode: 'SIMULATED', channel };
    if (channel.status === 'PENDING') {
      return {
        mode: 'UNAVAILABLE',
        channel,
        code: 'REGISTRATION_PENDING',
        reason:
          channel.statusReason ?? "The clinic's texting number is waiting for carrier approval.",
      };
    }
    if (channel.status === 'SUSPENDED') {
      return {
        mode: 'UNAVAILABLE',
        channel,
        code: 'SENDER_SUSPENDED',
        reason: channel.statusReason ?? "The clinic's texting number is suspended.",
      };
    }
    const { senderPhoneE164 } = channel;
    if (!this.telnyx.isConfigured || !senderPhoneE164) {
      return {
        mode: 'UNAVAILABLE',
        channel,
        code: 'PROVIDER_NOT_CONFIGURED',
        reason: 'Texting is not connected in this environment.',
      };
    }
    return { mode: 'LIVE', channel: { ...channel, senderPhoneE164 } };
  }
}
