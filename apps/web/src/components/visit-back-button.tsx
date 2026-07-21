import { BackButton } from './back-button';

export function VisitBackButton({ fallbackHref }: { fallbackHref: string }) {
  return <BackButton fallbackHref={fallbackHref} label="Return to the previous page" className="back-link patient-context-bar__back" />;
}
