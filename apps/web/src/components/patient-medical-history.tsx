import Link from 'next/link';
import { enumLabel, visitStateLabel } from '../lib/format';
import type { ClinicalAttachmentSummary, RecentVisitSummary } from '../lib/patient-types';

function date(value: string) {
  return new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function Attachments({ items }: { items: ClinicalAttachmentSummary[] }) {
  return (
    <ul className="patient-history-files">
      {items.map((item) => (
        <li key={item.id}>
          {item.href ? (
            <a href={`/api${item.href}`}>{item.label || item.fileName}</a>
          ) : (
            <span>{item.label || item.fileName}</span>
          )}
          <small>
            {item.removedAt ? 'Removed from active clinical history' : 'Clinical attachment'} ·{' '}
            {date(item.createdAt)}
          </small>
          {item.auditEvents
            ?.filter((event) =>
              ['REMOVED_FROM_FINALIZED_HISTORY', 'SUPERSEDED'].includes(event.action),
            )
            .map((event) => (
              <small
                key={`${event.action}-${event.createdAt}`}
                className="clinical-attachment-audit"
              >
                {event.action === 'SUPERSEDED' ? 'Corrected/replaced' : 'Audited removal'} by{' '}
                {event.actor?.displayName ||
                  [event.actor?.firstName, event.actor?.lastName].filter(Boolean).join(' ') ||
                  'authorized user'}{' '}
                on {new Date(event.createdAt).toLocaleString()}: {event.reason}
              </small>
            ))}
        </li>
      ))}
    </ul>
  );
}

export function PatientMedicalHistory({
  visits,
  attachments,
}: {
  visits: RecentVisitSummary[];
  attachments: ClinicalAttachmentSummary[];
}) {
  return (
    <section
      className="profile-card profile-card--wide"
      aria-labelledby="medical-record-summary-heading"
    >
      <div className="profile-card__header">
        <p className="eyebrow">Clinical record</p>
        <h2 id="medical-record-summary-heading">Medical History</h2>
      </div>
      <p className="patient-section-description">
        Recent visit notes, care, and clinical attachments.
      </p>
      {visits.length >= 5 ? (
        <p className="profile-permission-note">Showing the five most recent visits.</p>
      ) : null}
      {attachments.length ? (
        <section className="patient-history-attachments" aria-label="Patient attachments">
          <h3>Patient attachments</h3>
          <Attachments items={attachments} />
        </section>
      ) : null}
      {visits.length ? (
        <ol className="patient-history-timeline">
          {visits.map((visit) => (
            <li key={visit.id}>
              <article className="patient-history-entry">
                <header>
                  <div>
                    <time dateTime={visit.createdAt}>{date(visit.createdAt)}</time>
                    <h3>
                      <Link href={`/visits/${visit.id}`}>{visit.reason}</Link>
                    </h3>
                    <p>
                      {enumLabel(visit.visitType)} ·{' '}
                      {visit.primaryVeterinarian
                        ? `Dr. ${visit.primaryVeterinarian.firstName} ${visit.primaryVeterinarian.lastName}`
                        : 'Doctor unassigned'}
                    </p>
                  </div>
                  <span className="status-badge">{visitStateLabel(visit.state)}</span>
                </header>
                {visit.intake?.chiefComplaint || visit.intake?.historyNotes ? (
                  <p>{visit.intake.chiefComplaint || visit.intake.historyNotes}</p>
                ) : null}
                {visit.examFindings?.assessment ? (
                  <p>
                    <strong>Assessment:</strong> {visit.examFindings.assessment}
                  </p>
                ) : null}
                <details className="patient-history-details">
                  <summary>View documentation</summary>
                  <div>
                    {visit.careItems?.length ? (
                      <section>
                        <h4>Care</h4>
                        <ul>
                          {visit.careItems.map((item) => (
                            <li key={item.id}>
                              {enumLabel(item.type)}: {item.title} — {enumLabel(item.status)}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                    {visit.discharge ? (
                      <section>
                        <h4>Discharge</h4>
                        <p>{visit.discharge.instructions}</p>
                      </section>
                    ) : null}
                    {visit.soapNote ? (
                      <p>
                        <strong>SOAP v{visit.soapNote.version}:</strong>{' '}
                        {enumLabel(visit.soapNote.status)}
                        {visit.soapNote.amendmentReason
                          ? ` · Amended: ${visit.soapNote.amendmentReason}`
                          : ''}
                      </p>
                    ) : null}
                    {visit.attachments?.length ? (
                      <section>
                        <h4>Attachments</h4>
                        <Attachments items={visit.attachments} />
                      </section>
                    ) : null}
                    <Link href={`/visits/${visit.id}`}>Open full visit record →</Link>
                  </div>
                </details>
              </article>
            </li>
          ))}
        </ol>
      ) : (
        <div className="profile-compact-empty profile-compact-empty--roomy">
          <strong>No clinical history yet</strong>
          <span>Documented visits and care will appear here.</span>
        </div>
      )}
    </section>
  );
}
