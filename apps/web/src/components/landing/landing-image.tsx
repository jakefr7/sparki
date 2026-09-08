import Image from 'next/image';

import s from './landing.module.css';
import { LANDING_IMAGES, type LandingImageSlot } from './landing-images';

/**
 * The one place landing-page animal photography is rendered. Cropping, focal
 * point, responsive sources and the blur-up placeholder come from the registry
 * + `next/image`; the teal/warm grade, grain and section-specific `mask-image`
 * reveals are attached in `landing.module.css` via `[data-slot]`.
 *
 * Swapping a temporary photo for a final generated one is a file replace at the
 * same path and dimensions — this component and its callers do not change.
 */
export function LandingImage({
  slot,
  className,
  priority = false,
}: {
  slot: LandingImageSlot;
  /** Placement + animation hook supplied by the caller's stylesheet. */
  className?: string | undefined;
  priority?: boolean | undefined;
}) {
  const spec = LANDING_IMAGES[slot];

  return (
    <span
      className={className ? `${s.figure} ${className}` : s.figure}
      data-slot={slot}
      style={{ aspectRatio: spec.aspectRatio }}
    >
      <Image
        className={s.figureImg}
        src={spec.src}
        alt={spec.alt}
        fill
        sizes={spec.sizes}
        priority={priority}
        placeholder="blur"
        style={{ objectPosition: spec.focal }}
      />
      <span className={s.figureGrade} aria-hidden="true" />
      <span className={s.figureGrain} aria-hidden="true" />
    </span>
  );
}
