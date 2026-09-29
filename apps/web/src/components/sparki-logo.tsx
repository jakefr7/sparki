import mark from '../../public/brand/sparki-mark.png';
import wordmark from '../../public/brand/sparki-wordmark.png';
import styles from './sparki-logo.module.css';

export function SparkiLogo({
  kind = 'wordmark',
  className,
}: {
  kind?: 'wordmark' | 'mark';
  className?: string;
}) {
  const isMark = kind === 'mark';
  return (
    // These small brand assets are served directly from /public. Avoid routing
    // them through Next's image optimizer so the logo works without its
    // optional native image-processing dependency.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={isMark ? mark.src : wordmark.src}
      alt=""
      aria-hidden="true"
      width={isMark ? 745 : 870}
      height={isMark ? 775 : 341}
      className={[styles.image, isMark ? styles.mark : styles.wordmark, className].filter(Boolean).join(' ')}
    />
  );
}
