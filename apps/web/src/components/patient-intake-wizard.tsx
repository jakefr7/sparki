'use client';

import { useState } from 'react';
import { CreateClientForm, type CreatedClient } from './create-client-form';
import { CreatePatientForm } from './create-patient-form';
import { clientDisplayName } from '../lib/patient-types';

export function PatientIntakeWizard() {
  const [client, setClient] = useState<CreatedClient | null>(null);

  if (!client) {
    return (
      <>
        <p className="intake-form__step">Step 1 of 2: Client</p>
        <CreateClientForm onCreated={setClient} />
      </>
    );
  }

  return (
    <>
      <p className="intake-form__step">Step 2 of 2: Patient</p>
      <p className="patient-header__subtitle">Owner: {clientDisplayName(client)}</p>
      <CreatePatientForm clientId={client.id} />
    </>
  );
}
