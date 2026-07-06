'use client';

import { useState, type FormEvent } from 'react';
import { CONTACT_METHOD_OPTIONS } from '../lib/patient-types';

export interface CreatedClient {
  id: string;
  firstName: string;
  lastName: string;
}

export function CreateClientForm({ onCreated }: { onCreated: (client: CreatedClient) => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [preferredContactMethod, setPreferredContactMethod] = useState<string>(
    CONTACT_METHOD_OPTIONS[0],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          phone: phone || undefined,
          email: email || undefined,
          preferredContactMethod,
        }),
      });

      if (!response.ok) {
        setError('Could not create client. Check the fields and try again.');
        setSubmitting(false);
        return;
      }

      const client: CreatedClient = await response.json();
      onCreated(client);
    } catch {
      setError('Could not reach the server. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="intake-form">
      <label htmlFor="client-first-name">First name</label>
      <input
        id="client-first-name"
        type="text"
        value={firstName}
        onChange={(event) => setFirstName(event.target.value)}
        required
        maxLength={100}
        autoFocus
      />

      <label htmlFor="client-last-name">Last name</label>
      <input
        id="client-last-name"
        type="text"
        value={lastName}
        onChange={(event) => setLastName(event.target.value)}
        required
        maxLength={100}
      />

      <label htmlFor="client-phone">Mobile phone</label>
      <input
        id="client-phone"
        type="tel"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        required
        maxLength={50}
      />

      <label htmlFor="client-email">Email</label>
      <input
        id="client-email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Optional"
      />

      <label htmlFor="client-contact-method">Preferred communication method</label>
      <select
        id="client-contact-method"
        value={preferredContactMethod}
        onChange={(event) => setPreferredContactMethod(event.target.value)}
      >
        {CONTACT_METHOD_OPTIONS.map((method) => (
          <option key={method} value={method}>
            {method}
          </option>
        ))}
      </select>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Continue'}
      </button>
    </form>
  );
}
