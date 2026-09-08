import { OperationsCommandCenter } from '../components/operations-command-center';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { SESSION_COOKIE_NAME } from '../lib/auth-cookie';
import { LandingPage } from '../components/landing/landing-page';

export const metadata: Metadata = {
  title: 'Sparki — Your clinic. Finally in sync.',
  description:
    'The veterinary practice operating system that brings patients, scheduling, clinical care, team communication, and inventory into one connected workspace.',
};

export default async function HomePage() {
  const cookieStore = await cookies();
  return cookieStore.has(SESSION_COOKIE_NAME) ? <OperationsCommandCenter /> : <LandingPage />;
}
