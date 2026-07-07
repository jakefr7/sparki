import type { Request, Response } from 'express';

/** httpOnly cookie holding the WorkOS sealed session. Never read by client JS. */
export const SESSION_COOKIE_NAME = 'sparki_session';

// Matches the ceiling iron-session seals sessions for (see
// EdgeIronSessionProvider/WebIronSessionProvider in @workos-inc/node, which
// set ttl: 0 to allow the max seal lifetime); actual session lifetime is
// still governed by the underlying WorkOS refresh token expiring server-side.
const SESSION_COOKIE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;

export function readSessionCookie(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (!header) {
    return undefined;
  }
  for (const part of header.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const name = part.slice(0, separatorIndex).trim();
    if (name === SESSION_COOKIE_NAME) {
      return decodeURIComponent(part.slice(separatorIndex + 1).trim());
    }
  }
  return undefined;
}

export function setSessionCookie(response: Response, sealedSession: string, secure: boolean): void {
  response.cookie(SESSION_COOKIE_NAME, sealedSession, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
  });
}

export function clearSessionCookie(response: Response, secure: boolean): void {
  response.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
  });
}
