type PetKind = 'cat' | 'dog' | 'pet';

function petKind(species?: string | null): PetKind {
  const normalized = species?.trim().toLowerCase();
  if (normalized === 'cat' || normalized === 'feline') return 'cat';
  if (normalized === 'dog' || normalized === 'canine') return 'dog';
  return 'pet';
}

/** Sharp triangular ears (vs. the dog's floppy ones below) are the primary
 *  cat/dog read at small avatar sizes — everything else is secondary. */
function CatSilhouette() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M16 24 12 6l17 12h6l17-12-4 18a17 17 0 0 1 4 11c0 11-9.4 19-20 19s-20-8-20-19a17 17 0 0 1 4-11Z" />
      <circle className="pet-silhouette__eye" cx="25" cy="35" r="2.1" />
      <circle className="pet-silhouette__eye" cx="39" cy="35" r="2.1" />
      <path className="pet-silhouette__nose" d="M29 40h6l-3 3.4Z" />
      <path className="pet-silhouette__cutout" d="M25 46c2.4 3.2 11.6 3.2 14 0" />
    </svg>
  );
}

/** Same technique as the cat above — one outline whose ears are a clear
 *  protrusion into the empty space around the head, not a separate shape
 *  layered on top of it. The cat's ears point up into that space; the
 *  dog's droop out to the sides and down, which is the standard flat-icon
 *  cue for floppy ears. */
function DogSilhouette() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path
        d="M32 10C24 10 18 13 18 18 10 18 4 24 6 32 7 38 12 42 18 38 17 44 19 49 24 51 27 53 37 53 40 51 45 49 47 44 46 38 52 42 57 38 58 32 60 24 54 18 46 18 46 13 40 10 32 10Z"
      />
      <circle className="pet-silhouette__eye" cx="25" cy="28" r="2" />
      <circle className="pet-silhouette__eye" cx="39" cy="28" r="2" />
      <ellipse className="pet-silhouette__nose" cx="32" cy="42" rx="3.6" ry="2.8" />
      <path className="pet-silhouette__cutout" d="M26 48c2.4 2.8 10.4 2.8 12 0" />
    </svg>
  );
}

function PetSilhouette() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M17 30c0-10.5 6.2-18 15-18s15 7.5 15 18v6c0 10-6.2 17-15 17s-15-7-15-17v-6Z" />
      <path d="M18 27c-4.8-5.7-10.8-3.3-10.8 3.6 0 7 4.2 12 9.4 11" />
      <path d="M46 27c4.8-5.7 10.8-3.3 10.8 3.6 0 7-4.2 12-9.4 11" />
      <path className="pet-silhouette__cutout" d="M25 40c2 3 12 3 14 0" />
    </svg>
  );
}

export function PetPhotoPlaceholder({
  name,
  species,
  imageUrl,
  className = 'pet-photo-placeholder',
}: {
  name: string;
  species?: string | null | undefined;
  imageUrl?: string | null | undefined;
  className?: string;
}) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt={name} className={className} />;
  }
  const kind = petKind(species);
  const label = `${name} photo placeholder`;

  return (
    <span className={className} data-pet-kind={kind} aria-label={label} role="img">
      {kind === 'cat' ? <CatSilhouette /> : kind === 'dog' ? <DogSilhouette /> : <PetSilhouette />}
    </span>
  );
}
