import { describe, expect, it } from 'vitest';
import { enterTenantContext, getTenantContext } from './tenant-context';

const wait = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The shape of a signed-in request: the identity guard resolves the user
 *  asynchronously, TenantContextGuard binds the organization, the handler runs. */
async function signedInRequest(organizationId: string, handlerMs = 5): Promise<string | undefined> {
  await wait();
  enterTenantContext({ organizationId });
  await wait(handlerMs);
  return getTenantContext()?.organizationId;
}

/** A public route (webhook, invitation acceptance, signup): never binds one. */
async function publicRequest(handlerMs: number): Promise<string | undefined> {
  await wait(handlerMs);
  await wait();
  return getTenantContext()?.organizationId;
}

describe('tenant context', () => {
  // Keep this test first. The hazard it covers only exists for the first
  // organization bound in a process, so it has to be this file's first bind.
  it('keeps the first organization bound in a process inside its own request', async () => {
    const [inFlightPublic, signedIn] = await Promise.all([publicRequest(10), signedInRequest('org_a')]);

    expect(signedIn).toBe('org_a');
    // Already running when org_a was bound; must not be scoped to it.
    expect(inFlightPublic).toBeUndefined();
    // The code that started the requests — in the integration suite, the test itself.
    expect(getTenantContext()).toBeUndefined();
    // Work that starts afterwards.
    expect(await publicRequest(0)).toBeUndefined();
  });

  it('keeps concurrent requests bound to their own organization', async () => {
    const seen = await Promise.all([
      signedInRequest('org_a', 15),
      signedInRequest('org_b', 5),
      publicRequest(10),
    ]);

    expect(seen).toEqual(['org_a', 'org_b', undefined]);
    expect(getTenantContext()).toBeUndefined();
  });
});
