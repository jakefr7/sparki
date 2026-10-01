import { Prisma } from '../generated/client';
import { getTenantContext, type TenantContext } from './tenant-context';

/**
 * Defense-in-depth tenant isolation. Every model below carries an
 * organizationId column (computed from the live schema, not hand-maintained,
 * so a newly added tenant-scoped model is covered automatically on next
 * `prisma generate` — no one has to remember to update a list here).
 *
 * This does NOT replace the existing per-service organizationId filtering —
 * that stays exactly as it is. This is a backstop: if a query against one of
 * these models is missing (or wrong about) its organizationId filter, this
 * closes the gap instead of silently returning or mutating another
 * organization's row.
 *
 * Scope, deliberately: organizationId only, not locationId. The 50-companies
 * risk this exists for is cross-TENANT leakage; location is an in-tenant
 * subdivision that legitimate queries sometimes intentionally cross (e.g. an
 * org-wide report), so auto-scoping it here would risk breaking real
 * features rather than closing a real gap.
 *
 * Known gap: raw queries ($queryRaw/$executeRaw) are not — and cannot
 * safely be — intercepted here; Prisma hands this extension a finished SQL
 * string, not a structured where clause, and rewriting arbitrary SQL text is
 * not something to do blind. Those call sites (e.g.
 * ClientsService.search's trigram query) remain manually responsible for
 * their own organizationId filter, same as today.
 *
 * Known gap, deliberate for now: when no TenantContext is set — every
 * unauthenticated/pre-auth code path (clinic signup, invitation-by-token
 * lookup, billing webhooks, seed/migration scripts) — this extension is a
 * no-op and queries run exactly as they do today. Locking those down too
 * needs a case-by-case audit of each path (most need to keep running
 * cross-tenant, e.g. resolving an invitation by its token alone), which is
 * out of scope for this pass. TenantContextGuard only ever enters a context
 * for authenticated requests, which is deliberate: it never guesses at an
 * organizationId for a route it doesn't understand.
 */
const scopedModels = new Set(
  Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === 'organizationId' && field.kind === 'scalar'))
    .map((model) => model.name),
);

export function isTenantScopedModel(model: string): boolean {
  return scopedModels.has(model);
}

/** Arbitrary WhereInput — safe to AND-merge an extra condition into. */
const WHERE_MERGE_OPS = new Set(['findMany', 'findFirst', 'findFirstOrThrow', 'updateMany', 'deleteMany', 'count', 'aggregate', 'groupBy']);
/** WhereUniqueInput — Prisma's extended-where-unique support (stable since
 *  4.9, verified against this schema/version) lets a non-unique scalar ride
 *  alongside the unique identifier, turning "wrong tenant" into a normal
 *  not-found (P2025) instead of a cross-tenant hit. */
const UNIQUE_WHERE_OPS = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete']);

type Args = Record<string, unknown>;

/**
 * Pure transform, exported separately from the Prisma extension wiring so it
 * can be unit-tested without a database.
 */
export function applyTenantScope(model: string, operation: string, args: Args, context: TenantContext | undefined): Args {
  if (!context || !isTenantScopedModel(model)) return args;
  const { organizationId } = context;

  if (WHERE_MERGE_OPS.has(operation)) {
    const where = args.where as Record<string, unknown> | undefined;
    return { ...args, where: where ? { AND: [where, { organizationId }] } : { organizationId } };
  }

  if (UNIQUE_WHERE_OPS.has(operation)) {
    return { ...args, where: { ...(args.where as Record<string, unknown> | undefined), organizationId } };
  }

  if (operation === 'upsert') {
    return {
      ...args,
      where: { ...(args.where as Record<string, unknown> | undefined), organizationId },
      create: { ...(args.create as Record<string, unknown> | undefined), organizationId },
    };
  }

  if (operation === 'create') {
    return { ...args, data: { ...(args.data as Record<string, unknown> | undefined), organizationId } };
  }

  if (operation === 'createMany' || operation === 'createManyAndReturn') {
    const data = args.data;
    if (!Array.isArray(data)) return args;
    return { ...args, data: data.map((row) => ({ ...(row as Record<string, unknown>), organizationId })) };
  }

  return args;
}

export const tenantScopingExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: 'tenant-scoping',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(model ? applyTenantScope(model, operation, args as Args, getTenantContext()) : args);
        },
      },
    },
  }),
);
