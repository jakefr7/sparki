/** Must match SESSION_COOKIE_NAME in apps/api/src/auth/session-cookie.ts —
 *  the web app never seals/unseals this value itself, only checks for its
 *  presence (middleware) or forwards it opaquely (api-proxy). */
export const SESSION_COOKIE_NAME = 'sparki_session';
