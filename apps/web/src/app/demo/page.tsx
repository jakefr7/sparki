import type { Metadata } from 'next';
import { DemoPage } from '../../components/landing/demo-page';

export const metadata: Metadata = {
  title: 'Book a Demo — Sparki',
  description:
    'Explore Sparki with your team. Tell us about your veterinary clinic and the work you want to bring together.',
};
export default function Page() {
  return <DemoPage />;
}
