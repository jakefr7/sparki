import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  organizationId: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

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
