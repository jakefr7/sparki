import Link from 'next/link';
import { FrontDeskIntakeForm } from '../../../components/front-desk-intake-form';

export default function NewPatientPage() {
  return (
    <main className="page page--wide">
      <Link href="/" className="back-link">
        ← Back to search
      </Link>
      <p className="eyebrow">Front Desk</p>
      <FrontDeskIntakeForm />
    </main>
  );
}
