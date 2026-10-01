'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { PetPhotoPlaceholder } from './pet-photo-placeholder';

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function PatientPhotoActions({
  patientId,
  name,
  species,
  imageUrl,
}: {
  patientId: string;
  name: string;
  species: string;
  imageUrl: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const busy = uploading || saving;

  const previewUrl = localPreviewUrl ?? imageUrl;
  useEffect(() => setImageFailed(false), [previewUrl]);

  function updateMenuPosition() {
    const button = avatarButtonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const menuWidth = 280;
    const margin = 12;
    const left = Math.min(
      Math.max(margin, rect.left + rect.width / 2 - menuWidth / 2),
      window.innerWidth - menuWidth - margin,
    );
    setMenuPosition({ top: rect.bottom + 12, left });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
    function handleReposition() {
      updateMenuPosition();
    }
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || avatarButtonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  async function saveImageUrl(nextUrl: string | null) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/patients/${patientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: nextUrl }),
      });
      if (!response.ok) {
        throw new Error('photo update failed');
      }
      setOpen(false);
      setLocalPreviewUrl(null);
      router.refresh();
    } catch {
      setMessage('Could not remove this photo. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleLocalFile(file: File | undefined) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setMessage('Choose a JPEG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setMessage('Image is too large. Max size is 8MB.');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(objectUrl);
    setMessage(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`/api/patients/${patientId}/photo`, {
        method: 'POST',
        body,
      });
      if (!response.ok) {
        throw new Error('photo upload failed');
      }
      setOpen(false);
      router.refresh();
    } catch {
      setMessage('Could not upload this photo. Try again.');
    } finally {
      setUploading(false);
      setLocalPreviewUrl(null);
      URL.revokeObjectURL(objectUrl);
    }
  }

  return (
    <div className="patient-photo-control">
      <button
        ref={avatarButtonRef}
        type="button"
        className="patient-photo-control__avatar-button"
        onClick={() => setOpen((current) => !current)}
        disabled={busy}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={imageUrl ? 'Change patient photo' : 'Add patient photo'}
      >
        {previewUrl && !imageFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={name}
            className="pet-photo-placeholder patient-profile-photo"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <PetPhotoPlaceholder
            name={name}
            species={species}
            className="pet-photo-placeholder patient-profile-photo"
          />
        )}
        <span className="patient-photo-control__badge" aria-hidden="true">
          +
        </span>
      </button>
      {open &&
        menuPosition &&
        createPortal(
          <div
            ref={menuRef}
            className="patient-photo-menu patient-photo-menu--portal"
            role="dialog"
            aria-label="Patient photo options"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            <div className="patient-photo-menu__header">
              <strong>{imageUrl ? 'Change photo' : 'Add photo'}</strong>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close photo options">
                ×
              </button>
            </div>
            <div className="patient-photo-menu__actions">
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                {uploading ? 'Uploading...' : 'Upload image'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => {
                  void handleLocalFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
                hidden
              />
              {imageUrl && (
                <button type="button" onClick={() => saveImageUrl(null)} disabled={busy}>
                  Remove photo
                </button>
              )}
            </div>
            {message && <p role="alert">{message}</p>}
          </div>,
          document.body,
        )}
    </div>
  );
}
