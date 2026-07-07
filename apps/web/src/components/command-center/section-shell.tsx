import type { ReactNode } from 'react';

export function SectionShell({
  title,
  count,
  tone,
  attentionCount,
  children,
}: {
  title: string;
  count: number;
  tone?: 'waiting' | 'exam' | 'active' | 'checkout' | 'completed' | 'upcoming' | 'rail';
  attentionCount?: number | undefined;
  children: ReactNode;
}) {
  const headingId = `${title.replace(/\W+/g, '-').toLowerCase()}-heading`;
  const hasAttention = Boolean(attentionCount && attentionCount > 0);

  return (
    <details className={tone ? `ops-section ops-section--${tone}` : 'ops-section'} open>
      <summary className="ops-section__header">
        <span className="ops-section__heading">
          {tone && tone !== 'rail' && <span className="ops-section__dot" aria-hidden="true" />}
          <h2 id={headingId}>{title}</h2>
        </span>
        <span className="ops-section__toggle">
          {hasAttention && (
            <span
              className="ops-section__count ops-section__count--attention"
              title={`${attentionCount} need attention`}
            >
              {attentionCount}
            </span>
          )}
          <span className="ops-section__count">{count}</span>
          <span className="ops-section__chevron" aria-hidden="true" />
        </span>
      </summary>
      <div className="ops-section__body">{children}</div>
    </details>
  );
}
