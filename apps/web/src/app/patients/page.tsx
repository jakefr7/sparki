import Link from 'next/link';
import { PatientSearch } from '../../components/patient-search';

export default function PatientsClientsPage() {
  return (
    <main className="page page--wide simple-hub">
      <Link href="/" className="back-link">
        Back to dashboard
      </Link>
      <header className="simple-hub__header">
        <p className="eyebrow">Patients / Clients</p>
        <h1>Find a patient or client</h1>
        <p>Search by pet, client, phone, or email to open the patient profile hub.</p>
      </header>
      <section className="home-widget">
        <PatientSearch />
      </section>
    </main>
  );
}
