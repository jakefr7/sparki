'use client';

import { useRouter } from 'next/navigation';

export function BackButton({
  fallbackHref,
  label,
  className = 'back-link',
}: {
  fallbackHref: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();

  function handleBack() {
    const referrer = document.referrer;
    let isSameOriginReferrer = true;
    if (referrer) {
      try {
        isSameOriginReferrer = new URL(referrer).origin === window.location.origin;
      } catch {
        isSameOriginReferrer = false;
      }
    }

    if (window.history.length > 1 && isSameOriginReferrer) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  }

  return (
    <button type="button" className={className} onClick={handleBack} aria-label={label}>
      <span aria-hidden="true" className="back-link__icon">
        ←
      </span>
    </button>
  );
}
