import { describe, expect, it } from 'vitest';
import { cleanMessageBody, countSmsSegments, detectConsentKeyword } from './sms-text';

describe('countSmsSegments', () => {
  it('counts plain text at 160 characters per single segment', () => {
    expect(countSmsSegments('a'.repeat(160))).toBe(1);
    expect(countSmsSegments('a'.repeat(161))).toBe(2);
    expect(countSmsSegments('a'.repeat(306))).toBe(2);
    expect(countSmsSegments('a'.repeat(307))).toBe(3);
  });

  it('counts extended GSM characters as two', () => {
    expect(countSmsSegments('['.repeat(80))).toBe(1);
    expect(countSmsSegments('['.repeat(81))).toBe(2);
  });

  it('switches to 70 characters per segment when any character is outside GSM-7', () => {
    expect(countSmsSegments(`${'a'.repeat(69)}’`)).toBe(1);
    expect(countSmsSegments(`${'a'.repeat(70)}’`)).toBe(2);
    expect(countSmsSegments('🐶'.repeat(35))).toBe(1);
    expect(countSmsSegments('🐶'.repeat(36))).toBe(2);
  });
});

describe('cleanMessageBody', () => {
  it('keeps newlines and angle brackets, drops control characters, trims', () => {
    expect(cleanMessageBody('  Finley is <5 lb\nSee you at 3\u0000\u0007  ')).toBe(
      'Finley is <5 lb\nSee you at 3',
    );
  });
});

describe('detectConsentKeyword', () => {
  it.each([
    'STOP',
    'stop.',
    ' Stop ',
    'UNSUBSCRIBE',
    'opt out',
    'Opt-Out',
    'QUIT',
    'end',
    'Revoke',
    'cancel',
    'STOPALL',
  ])('treats "%s" as an opt-out', (body) => {
    expect(detectConsentKeyword(body)).toBe('OPT_OUT');
  });

  it.each(['START', 'unstop', 'Start!'])('treats "%s" as an opt-in', (body) => {
    expect(detectConsentKeyword(body)).toBe('OPT_IN');
  });

  it.each([
    'Please stop by at 3',
    'Can we cancel the appointment?',
    'When does the visit end',
    'Stop texting me about the reminder please',
    '',
  ])('does not treat "%s" as a keyword', (body) => {
    expect(detectConsentKeyword(body)).toBeNull();
  });
});
