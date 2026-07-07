type PetKind = 'cat' | 'dog' | 'pet';

function petKind(species?: string | null): PetKind {
  const normalized = species?.trim().toLowerCase();
  if (normalized === 'cat' || normalized === 'feline') return 'cat';
  if (normalized === 'dog' || normalized === 'canine') return 'dog';
  return 'pet';
}

function CatSilhouette() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M15 24 13 10l12 8a22 22 0 0 1 14 0l12-8-2 14a20 20 0 0 1 3 11c0 11-8.5 19-20 19s-20-8-20-19a20 20 0 0 1 3-11Z" />
      <path className="pet-silhouette__cutout" d="M24 38c2.2 3.4 13.8 3.4 16 0" />
    </svg>
  );
}

function DogSilhouette() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M19 25 14 13c7 0 12 4 14 9a21 21 0 0 1 8 0c2-5 7-9 14-9l-5 12c5 4 7 10 7 16 0 9-7 14-20 14s-20-5-20-14c0-6 2-12 7-16Z" />
      <path className="pet-silhouette__cutout" d="M24 40c2.2 4 13.8 4 16 0" />
      <path className="pet-silhouette__nose" d="M29 32h6l-3 4Z" />
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
  className = 'pet-photo-placeholder',
}: {
  name: string;
  species?: string | null | undefined;
  className?: string;
}) {
  const kind = petKind(species);
  const label = `${name} photo placeholder`;

  return (
    <span className={className} data-pet-kind={kind} aria-label={label} role="img">
      {kind === 'cat' ? <CatSilhouette /> : kind === 'dog' ? <DogSilhouette /> : <PetSilhouette />}
    </span>
  );
}
