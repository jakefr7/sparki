import Link from 'next/link';
import { PatientIntakeWizard } from '../../../components/patient-intake-wizard';

export default function NewPatientPage() {
  return (
    <main className="page">
      <Link href="/" className="back-link">
        ← Back to search
      </Link>
      <h1>Create New Patient</h1>
      <PatientIntakeWizard />
    </main>
  );
}
