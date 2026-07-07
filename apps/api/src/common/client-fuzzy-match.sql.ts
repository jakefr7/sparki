import { Prisma } from '@sparki/db';

/**
 * Shared Client fuzzy-match fragments for raw SQL search queries (backed by
 * the pg_trgm GIN indexes — see prisma/schema.prisma). Substring ILIKE always
 * qualifies regardless of the trigram similarity threshold, so exact/partial
 * typed names never get filtered out; the `%` operator adds typo-tolerant
 * recall on top of that.
 *
 * `tableAlias` is a fixed SQL identifier supplied by the calling query (e.g.
 * `''` for an unaliased `Client` table, `'c'` for a joined alias) — never
 * user input — so it's safe to splice in via `Prisma.raw`.
 */
function columnRef(tableAlias: string, column: string): Prisma.Sql {
  return Prisma.raw(tableAlias ? `${tableAlias}."${column}"` : `"${column}"`);
}

export function clientFuzzyMatchCondition(tableAlias: string, query: string): Prisma.Sql {
  const firstName = columnRef(tableAlias, 'firstName');
  const lastName = columnRef(tableAlias, 'lastName');
  const phone = columnRef(tableAlias, 'phone');
  const email = columnRef(tableAlias, 'email');

  return Prisma.sql`(
    (${firstName} || ' ' || ${lastName}) ILIKE '%' || ${query} || '%'
    OR (${firstName} || ' ' || ${lastName}) % ${query}
    OR ${phone} ILIKE '%' || ${query} || '%'
    OR ${email} ILIKE '%' || ${query} || '%'
  )`;
}

export function clientNameSimilarity(tableAlias: string, query: string): Prisma.Sql {
  const firstName = columnRef(tableAlias, 'firstName');
  const lastName = columnRef(tableAlias, 'lastName');

  return Prisma.sql`similarity(lower(${firstName} || ' ' || ${lastName}), lower(${query}))`;
}
