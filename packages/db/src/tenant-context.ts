import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  organizationId: string;
}

const storage = new AsyncLocalStorage<TenantContext | undefined>();

// Start tracking now, with no tenant bound. Node only begins following async
// work for a storage on its first use, and anything already running at that
// moment is untracked — its `enterWith` lands on the one resource shared by
// all untracked work in the process. If the first use were a request's
// enterTenantContext below, that organization would be bound for every
// request already in flight (a webhook, an invitation acceptance) and for
// whatever started the server — in the integration suite, the test's own
// fixture writes. Using the storage here, before any request exists, means
// each request is tracked from its start and binds only itself.
// See tenant-context.spec.ts.
storage.enterWith(undefined);

/**
 * Binds every Prisma call made for the remainder of this request's async
 * chain to `context`, so the tenant-scoping extension (see
 * tenant-scoping.ts) can enforce/inject organizationId without every
 * service method having to pass it explicitly. Called once per request, by
 * TenantContextGuard, right after the identity guard resolves request.user —
 * `enterWith` rather than `run` because a guard's canActivate() can't wrap
 * the controller handler in a callback.
 */
export function enterTenantContext(context: TenantContext): void {
  storage.enterWith(context);
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}
