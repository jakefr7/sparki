/** Shared browser response handling for the clinic setup and team surfaces. */
export class ClinicApiError extends Error {
  constructor(public readonly status: number, public readonly code: string | null, message: string) { super(message); }
}
export function friendlyClinicError(error: unknown): string {
  if (!(error instanceof ClinicApiError)) return 'We couldn’t complete that request. Try again.';
  if (error.code === 'EMAIL_ALREADY_REGISTERED') return 'This email already has a Sparki account.';
  if (error.status === 403) return 'You don’t have permission to make this change.';
  if (error.status === 409 && /your own membership/i.test(error.message)) return 'You can’t disable your own account.';
  if (error.status === 409 && /owner/i.test(error.message)) return 'Your clinic must always have at least one active owner.';
  if (error.status === 409) return 'This changed while you were working. Refresh and try again.';
  return 'We couldn’t complete that request. Try again.';
}
export async function clinicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { cache: 'no-store', ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const issue = body && typeof body === 'object' ? body as { code?: string; message?: string } : {};
    throw new ClinicApiError(response.status, issue.code ?? null, typeof issue.message === 'string' ? issue.message : 'Request failed');
  }
  return body as T;
}
