'use client';

import { CRT_ASSESSMENTS, CRT_LABELS, type CrtAssessment } from '@sparki/config';
import type { IntakePayload } from '../lib/visit-intake-fields';

export function VitalObservationFields({ payload, onChange }: { payload: IntakePayload; onChange: (patch: Partial<IntakePayload>) => void }) {
  return <>
    <label htmlFor="respiratoryRate"><span>Respiratory rate</span>
      <select aria-label="Respiratory observation" value={payload.respiratoryPattern ?? 'Measured'} onChange={event => onChange({ respiratoryPattern: event.target.value === 'Pant' ? 'Pant' : null, respiratoryRate: null })}>
        <option value="Measured">Measured rate</option><option value="Pant">Pant</option>
      </select>
      {payload.respiratoryPattern !== 'Pant' ? <div className="intake-simple-unit"><input aria-label="Respiratory rate" id="respiratoryRate" type="number" min="1" max="200" value={payload.respiratoryRate ?? ''} onChange={event => onChange({ respiratoryRate: event.target.value === '' ? null : Number(event.target.value), respiratoryPattern: null })}/><span>rpm</span></div> : <span id="respiratoryRate">Pant</span>}
    </label>
    <label htmlFor="crtSeconds"><span>Capillary refill</span>
      <select aria-label="Capillary refill" id="crtSeconds" value={payload.crtAssessment ?? (payload.crtSeconds != null ? 'LegacyMeasurement' : '')} onChange={event => onChange({ crtAssessment: event.target.value ? event.target.value as CrtAssessment : null, crtSeconds: null })}>
        <option value="">Select assessment</option>
        {payload.crtSeconds != null && !payload.crtAssessment ? <option value="LegacyMeasurement">Recorded measurement: {payload.crtSeconds} sec</option> : null}
        {CRT_ASSESSMENTS.map(value => <option key={value} value={value}>{CRT_LABELS[value]}</option>)}
      </select>
    </label>
  </>;
}
