import type { StaticImageData } from 'next/image';

import flowPortrait from '../../../public/landing/flow-portrait.jpg';
import heroPortrait from '../../../public/landing/hero-portrait.jpg';

/**
 * Single source of truth for the landing page's dog / cat imagery.
 *
 * Two portraits, deliberately: one Siberian Husky (the patient) in the hero and
 * one cat during the patient journey. Fewer, better compositions rather than
 * pet cards scattered down the page.
 *
 * The image *files* under `public/landing/` are temporary, license-clear
 * Unsplash photographs (see `docs/landing-image-direction.md`). Every visual
 * decision that survives a one-for-one swap — aspect ratio, focal point, alt
 * text, responsive `sizes` — lives here rather than in the JSX, so replacing a
 * photo later means editing the file plus, at most, one `focal` value.
 */
export type LandingImageSlot = 'hero' | 'flow';

export interface LandingImageSpec {
  /** Statically imported so Next generates width/height, srcset and a blur placeholder. */
  readonly src: StaticImageData;
  /** Empty string marks the image as decorative (meaning carried by nearby copy). */
  readonly alt: string;
  /** CSS `aspect-ratio` for the frame the photo is cropped into. */
  readonly aspectRatio: string;
  /** CSS `object-position` — the point kept in frame as the crop changes. */
  readonly focal: string;
  /** `next/image` `sizes` hint for responsive source selection. */
  readonly sizes: string;
}

export const LANDING_IMAGES: Record<LandingImageSlot, LandingImageSpec> = {
  hero: {
    src: heroPortrait,
    alt: '',
    aspectRatio: '4 / 5',
    focal: '43% 46%',
    sizes: '(max-width: 640px) 72vw, (max-width: 1100px) 40vw, 460px',
  },
  flow: {
    src: flowPortrait,
    alt: 'A cat being examined in a veterinary clinic',
    aspectRatio: '1 / 1',
    focal: '55% 42%',
    sizes: '(max-width: 640px) 100vw, (max-width: 1100px) 45vw, 420px',
  },
};
