import { ForbiddenException } from '@nestjs/common';
import type { ClientMessagingChannel, ClientTextingConsent } from '@sparki/db';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/types';
import { statusAdvances } from './client-communication.constants';
import { ClientCommunicationController } from './client-communication.controller';
import { matchState } from './client-communication.presenter';
import { sendEligibility, type ClientCommunicationService } from './client-communication.service';
import type { TextingReadiness } from './client-texting-readiness.service';

const jordan = { id: 'client-jordan', firstName: 'Jordan', lastName: 'Ellis' };
const sam = { id: 'client-sam', firstName: 'Sam', lastName: 'Ellis' };

describe('matchState', () => {
  it.each([
    ['linked to the only client with the number', jordan.id, [jordan], 'MATCHED'],
    ['linked, but another client shares the number', jordan.id, [jordan, sam], 'SHARED'],
    ['not linked, a client has the number', null, [jordan], 'NEEDS_LINK'],
    ['not linked, nobody has the number', null, [], 'UNMATCHED'],
    ['linked to a client whose record lost the number', jordan.id, [sam], 'NUMBER_NOT_ON_CLIENT'],
    ['linked to a client and nobody has the number', jordan.id, [], 'NUMBER_NOT_ON_CLIENT'],
  ] as const)('%s', (_label, clientId, candidates, expected) => {
    expect(matchState(clientId, [...candidates])).toBe(expected);
  });
});

describe('sendEligibility', () => {
  const channel = { senderPhoneE164: '+13125550100' } as ClientMessagingChannel & {
    senderPhoneE164: string;
  };
  const simulated: TextingReadiness = { mode: 'SIMULATED', channel };
  const consent = (overrides: Partial<ClientTextingConsent>) =>
    ({ status: 'GRANTED', basis: 'STAFF_RECORDED', ...overrides }) as ClientTextingConsent;

  it('allows a consented, matched number', () => {
    expect(sendEligibility(simulated, consent({}), 'MATCHED')).toEqual({
      canSend: true,
      code: null,
      message: null,
    });
    expect(
      sendEligibility(
        { mode: 'LIVE', channel },
        consent({ basis: 'CLIENT_INITIATED' }),
        'UNMATCHED',
      ).canSend,
    ).toBe(true);
  });

  it('refuses everything where texting has not been set up', () => {
    expect(
      sendEligibility({ mode: 'NOT_SET_UP', channel: null }, consent({}), 'MATCHED'),
    ).toMatchObject({
      canSend: false,
      code: 'TEXTING_NOT_SET_UP',
    });
  });

  it('requires recorded consent before the clinic starts texting', () => {
    expect(sendEligibility(simulated, null, 'MATCHED')).toMatchObject({
      canSend: false,
      code: 'CONSENT_REQUIRED',
    });
  });

  it('blocks an opted-out number and says who has to undo it', () => {
    const byKeyword = sendEligibility(
      simulated,
      consent({ status: 'OPTED_OUT', basis: 'KEYWORD' }),
      'MATCHED',
    );
    const byStaff = sendEligibility(
      simulated,
      consent({ status: 'OPTED_OUT', basis: 'STAFF_RECORDED' }),
      'MATCHED',
    );

    expect(byKeyword).toMatchObject({ canSend: false, code: 'OPTED_OUT' });
    expect(byKeyword.message).toContain('START');
    expect(byStaff).toMatchObject({ canSend: false, code: 'OPTED_OUT' });
    expect(byStaff.message).not.toContain('START');
  });

  it('blocks texting a number that is no longer on the linked client', () => {
    expect(sendEligibility(simulated, consent({}), 'NUMBER_NOT_ON_CLIENT')).toMatchObject({
      canSend: false,
      code: 'NUMBER_NOT_ON_CLIENT',
    });
  });

  it('reports an unavailable sender before anything else, never falling back to simulation', () => {
    const pending: TextingReadiness = {
      mode: 'UNAVAILABLE',
      channel,
      code: 'REGISTRATION_PENDING',
      reason: 'Waiting for carrier approval.',
    };

    expect(sendEligibility(pending, null, 'MATCHED')).toEqual({
      canSend: false,
      code: 'REGISTRATION_PENDING',
      message: 'Waiting for carrier approval.',
    });
  });
});

describe('statusAdvances', () => {
  it('moves forward through delivery', () => {
    expect(statusAdvances('SENDING', 'SENT')).toBe(true);
    expect(statusAdvances('SENT', 'DELIVERED')).toBe(true);
    expect(statusAdvances('OUTCOME_UNKNOWN', 'DELIVERED')).toBe(true);
    expect(statusAdvances('SENT', 'FAILED')).toBe(true);
  });

  it('never lets a late, older update overwrite a newer fact', () => {
    expect(statusAdvances('DELIVERED', 'SENT')).toBe(false);
    expect(statusAdvances('DELIVERED', 'DELIVERY_UNCONFIRMED')).toBe(false);
    expect(statusAdvances('FAILED', 'DELIVERED')).toBe(false);
    expect(statusAdvances('DELIVERED', 'FAILED')).toBe(false);
    expect(statusAdvances('SIMULATED', 'SENT')).toBe(false);
  });
});

describe('ClientCommunicationController roles', () => {
  const user = (role: AuthenticatedUser['role']) => ({ role }) as AuthenticatedUser;
  const service = { listThreads: vi.fn().mockResolvedValue({ threads: [] }), readiness: vi.fn() };
  const controller = new ClientCommunicationController(
    service as unknown as ClientCommunicationService,
  );

  it("never lets a pet owner's account read the clinic inbox", () => {
    expect(() => controller.listThreads(user('CLIENT'), { view: 'all', limit: 30 })).toThrow(
      ForbiddenException,
    );
    expect(() => controller.readiness(user('CLIENT'))).toThrow(ForbiddenException);
    expect(service.listThreads).not.toHaveBeenCalled();
  });

  it.each([
    'OWNER',
    'PRACTICE_MANAGER',
    'RECEPTIONIST',
    'VETERINARIAN',
    'TECHNICIAN',
    'ASSISTANT',
  ] as const)('lets %s use client communication', async (role) => {
    await expect(controller.listThreads(user(role), { view: 'all', limit: 30 })).resolves.toEqual({
      threads: [],
    });
  });
});
