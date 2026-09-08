import type { StaticImageData } from 'next/image';

import beliefPortrait from '../../../public/landing/belief-portrait.jpg';
import flowPortrait from '../../../public/landing/flow-portrait.jpg';
import heroPortrait from '../../../public/landing/hero-portrait.jpg';

/**
 * Single source of truth for the landing page's dog / cat imagery.
 *
 * The image *files* under `public/landing/` are temporary, license-clear
 * Unsplash photographs (see `docs/landing-image-direction.md`). Every visual
 * decision that survives a one-for-one swap — aspect ratio, focal point, alt
 * text, responsive `sizes` — lives here rather than in the JSX, so replacing a
 * photo later means editing the file plus, at most, one `focal` value.
 */
export type LandingImageSlot = 'hero' | 'flow' | 'belief';

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
    focal: '52% 40%',
    sizes: '(max-width: 640px) 70vw, (max-width: 1100px) 40vw, 460px',
  },
  flow: {
    src: flowPortrait,
    alt: 'A clinic patient',
    aspectRatio: '1 / 1',
    focal: '50% 34%',
    sizes: '(max-width: 640px) 100vw, (max-width: 1100px) 45vw, 420px',
  },
  belief: {
    src: beliefPortrait,
    alt: '',
    aspectRatio: '3 / 4',
    focal: '62% 42%',
    sizes: '(max-width: 640px) 80vw, (max-width: 1100px) 45vw, 440px',
  },
};
