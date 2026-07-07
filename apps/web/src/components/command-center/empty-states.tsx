export function EmptyQueue({ label }: { label: string }) {
  return (
    <p className="ops-empty-state">
      <span className="ops-empty-state__mark" aria-hidden="true">
        ✓
      </span>
      {label}
    </p>
  );
}
