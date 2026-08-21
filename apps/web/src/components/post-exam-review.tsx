import type { VisitDetail } from '../lib/patient-types';

const CLINICAL_WORK_TYPES = new Set(['Diagnostic', 'Estimate', 'ClientApproval', 'Treatment', 'Medication', 'ClientCommunication']);

type StructuredObjective = {
  kind?: string;
  general?: { painScore?: string; bodyConditionScore?: string };
  systems?: Record<string, { status?: string; notes?: string }>;
  additionalNotes?: string;
};

const SYSTEM_LABELS: Record<string, string> = {
  eyes: 'Eyes', ears: 'Ears', noseThroat: 'Nose & throat', oralDental: 'Oral & dental',
  cardiovascular: 'Cardiovascular', respiratory: 'Respiratory', abdomen: 'Abdomen / GI',
  urogenital: 'Urogenital', musculoskeletal: 'Musculoskeletal', neurologic: 'Neurologic',
  skinCoat: 'Skin & coat', lymphNodes: 'Peripheral lymph nodes',
};

function parseObjective(value: string | null | undefined): StructuredObjective | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as StructuredObjective;
    return parsed.kind === 'sparki-small-animal-exam' ? parsed : null;
  } catch { return null; }
}

export function PostExamReview({ visit }: { visit: VisitDetail }) {
  const exam = visit.examFindings;
  if (!exam?.completedAt) return null;
  const objective = parseObjective(exam.objective);
  const notableFindings = objective?.systems
    ? Object.entries(objective.systems).filter(([, finding]) => finding.status === 'Abnormal' || Boolean(finding.notes))
    : [];
  const work = visit.workItems.filter((item) => CLINICAL_WORK_TYPES.has(item.type));
  const openWork = work.filter((item) => ['Pending', 'InProgress'].includes(item.status));
  return (
    <section className="post-exam-review" aria-labelledby="post-exam-review-heading">
      <div className="post-exam-review__complete">
        <span className="post-exam-review__check" aria-hidden="true">✓</span>
        <div><p className="eyebrow">Clinical evidence</p><h2 id="post-exam-review-heading">Exam summary</h2><p>Review the findings that inform today’s recommendations.</p></div>
        <div className="post-exam-review__statuses" aria-label="Post-exam status">
          <span className="is-complete"><i aria-hidden="true">✓</i>Exam complete</span>
          <span className={openWork.length ? 'has-open-work' : work.length ? 'is-complete' : ''}><i aria-hidden="true" />{openWork.length ? `${openWork.length} pending` : work.length ? 'Plan resolved' : 'Plan not started'}</span>
        </div>
      </div>

      <div className="post-exam-review__summary">
        <div className="post-exam-review__summary-header"><div><p className="eyebrow">Doctor’s review</p><h3>Clinical conclusions</h3></div><span>Read only</span></div>
        <div className="post-exam-review__summary-grid">
          <article><span>Problem list / diagnoses</span><p>{exam.assessment || 'No problems or diagnoses documented.'}</p></article>
          <article><span>Recommendations</span><p>{exam.plan || 'No recommendations documented.'}</p></article>
          <article className="post-exam-review__findings"><span>Notable physical exam findings</span>{notableFindings.length ? <ul>{notableFindings.map(([key, finding]) => <li key={key}><strong>{SYSTEM_LABELS[key] ?? key}</strong><span className="post-exam-review__abnormal">{finding.status}</span>{finding.notes ? <p>{finding.notes}</p> : null}</li>)}</ul> : <p>{objective?.additionalNotes || 'No abnormal findings documented.'}</p>}</article>
          <article><span>Baseline measures</span><p>{[objective?.general?.painScore && `Pain: ${objective.general.painScore}`, objective?.general?.bodyConditionScore && `BCS: ${objective.general.bodyConditionScore}/9`].filter(Boolean).join(' · ') || 'Not captured'}</p></article>
        </div>
      </div>

    </section>
  );
}
