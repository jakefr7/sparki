'use client';
export interface MessagingContext { recordType: 'PATIENT' | 'CLIENT' | 'APPOINTMENT' | 'VISIT' | 'TASK' | 'MEDICAL_RECORD'; recordId: string; label: string; detail?: string }
export function MessageStaffButton({ context, className = 'button-secondary' }: { context: MessagingContext; className?: string }) {
  return <button type="button" className={className} onClick={() => window.dispatchEvent(new CustomEvent('sparki:message-staff', { detail: context }))}>Message Staff</button>;
}
