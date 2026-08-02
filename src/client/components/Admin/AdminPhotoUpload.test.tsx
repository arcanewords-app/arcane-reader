// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { AdminPhotoUpload } from './AdminPhotoUpload.js';

describe('AdminPhotoUpload', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows drop hint when no preview', () => {
    render(
      <AdminPhotoUpload
        inputId="photo-input"
        previewUrl={null}
        onFileChange={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    expect(screen.getByText('admin.form.photoHint')).toBeTruthy();
    expect(document.getElementById('photo-input')).toBeTruthy();
  });

  it('shows preview and calls onRemove', () => {
    const onRemove = vi.fn();
    render(
      <AdminPhotoUpload
        inputId="photo-input"
        previewUrl="blob:preview"
        onFileChange={vi.fn()}
        onRemove={onRemove}
      />
    );

    expect(document.querySelector('.admin-photo-preview-img')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('admin.form.removePhoto'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('shows preview image when previewUrl is set', () => {
    render(
      <AdminPhotoUpload
        inputId="photo-input"
        previewUrl="blob:preview"
        onFileChange={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    const img = document.querySelector('.admin-photo-preview-img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain('blob:preview');
  });
});
