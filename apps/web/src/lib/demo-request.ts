/** Integration boundary for the future first-party demo lead workflow.
 * No network request, persistence, email, or delivery is implemented yet.
 * Wire this adapter only when a validated, abuse-protected backend exists.
 */
export interface DemoRequest {
  name: string;
  email: string;
  organization: string;
  role: string;
  veterinarians: string;
  phone: string;
  message: string;
}
export const DEMO_REQUEST_AVAILABLE = false;
export type DemoRequestResult = { status: 'unavailable'; message: string };
export async function submitDemoRequest(_request: DemoRequest): Promise<DemoRequestResult> {
  return {
    status: 'unavailable',
    message:
      'Your request has not been sent or saved. Demo requests are not available yet. Please check back soon.',
  };
}
