/** Longest text Sparki accepts for one message (ten standard segments). */
export const MAX_MESSAGE_LENGTH = 1600;

// GSM 03.38 basic character set. A message made only of these (plus the
// extension characters below) is sent 7-bit, 160 characters per segment.
const GSM_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);
// Each of these costs two 7-bit characters.
const GSM_EXTENDED = new Set('^{}\\[~]|€\f');

/**
 * How many billable segments a text will be split into. An estimate for the
 * composer and for simulated messages — a real provider reports its own
 * count when it accepts a message, and that count is what gets stored.
 */
export function countSmsSegments(body: string): number {
  let septets = 0;
  let gsm = true;
  for (const character of body) {
    if (GSM_BASIC.has(character)) septets += 1;
    else if (GSM_EXTENDED.has(character)) septets += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) return septets <= 160 ? 1 : Math.ceil(septets / 153);
  // Anything outside GSM-7 (emoji, curly quotes) forces UCS-2: 70 UTF-16
  // code units per segment, 67 once the message is split.
  return body.length <= 70 ? 1 : Math.ceil(body.length / 67);
}

/**
 * A text message is plain text. Strip control characters that have no
 * meaning in one (keeping newlines and tabs) and trim; do not strip
 * angle-bracketed text — "<5 lb" is something a clinic really types.
 */
export function cleanMessageBody(body: string): string {
  // eslint-disable-next-line no-control-regex
  return body.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

const OPT_OUT_KEYWORDS = new Set([
  'stop',
  'stopall',
  'stop all',
  'unsubscribe',
  'cancel',
  'end',
  'quit',
  'revoke',
  'opt out',
  'optout',
]);
const OPT_IN_KEYWORDS = new Set(['start', 'unstop']);

export type ConsentKeyword = 'OPT_OUT' | 'OPT_IN' | null;

/**
 * Recognizes a message that is, in its entirety, an opt-out or opt-in
 * keyword (the FCC's listed words plus the carriers' STOPALL/START/UNSTOP).
 * Only whole-message matches count: "please stop by at 3" must never opt a
 * client out. A client who opts out in their own words is handled by staff
 * recording it.
 */
export function detectConsentKeyword(body: string): ConsentKeyword {
  const normalized = body
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (OPT_OUT_KEYWORDS.has(normalized)) return 'OPT_OUT';
  if (OPT_IN_KEYWORDS.has(normalized)) return 'OPT_IN';
  return null;
}
