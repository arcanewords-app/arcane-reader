import type { RefObject } from 'preact';

interface EntityPreviewBodyProps {
  name: string;
  photoUrl?: string | null;
  description?: string | null;
  previewRef: RefObject<HTMLDivElement | null>;
}

/** Avatar, name, and bio shared by catalog chips and entity cards. */
export function EntityPreviewBody({
  name,
  photoUrl,
  description,
  previewRef,
}: EntityPreviewBodyProps) {
  const previewName = name.trim() || '—';
  const initial = previewName.charAt(0).toUpperCase() || '?';
  const bio = description?.trim() ?? '';

  return (
    <>
      <div class="card-content-popup__avatar" aria-hidden="true">
        {photoUrl?.trim() ? (
          <img src={photoUrl} alt="" class="card-content-popup__photo" loading="lazy" />
        ) : (
          <div class="card-content-popup__placeholder">{initial}</div>
        )}
      </div>
      <div class="card-content-popup__body">
        <div class="card-content-popup__name">{previewName}</div>
        {bio ? (
          <div class="card-content-popup__preview-text" ref={previewRef}>
            {description}
          </div>
        ) : null}
      </div>
    </>
  );
}
