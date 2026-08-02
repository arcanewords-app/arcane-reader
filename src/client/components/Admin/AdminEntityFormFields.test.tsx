// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('./AdminPhotoUpload', () => ({
  AdminPhotoUpload: ({ inputId }: { inputId: string }) => (
    <div data-testid="photo-upload" data-input-id={inputId} />
  ),
}));

import { AdminEntityFormFields } from './AdminEntityFormFields.js';

const baseProps = {
  name: '',
  onNameChange: vi.fn(),
  description: '',
  onDescriptionChange: vi.fn(),
  photoInputId: 'photo-input',
  photoPreviewUrl: null as string | null,
  onPhotoChange: vi.fn(),
  onPhotoRemove: vi.fn(),
  descriptionInputId: 'desc-input',
};

describe('AdminEntityFormFields', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders name field and calls onNameChange', () => {
    const onNameChange = vi.fn();
    render(<AdminEntityFormFields kind="author" {...baseProps} onNameChange={onNameChange} />);

    fireEvent.input(screen.getByPlaceholderText('admin.form.namePlaceholder'), {
      target: { value: 'Alice' },
    });
    expect(onNameChange).toHaveBeenCalledWith('Alice');
  });

  it('renders description and photo upload for author kind', () => {
    render(<AdminEntityFormFields kind="author" {...baseProps} />);

    expect(screen.getByText('admin.form.description')).toBeTruthy();
    expect(screen.getByTestId('photo-upload')).toBeTruthy();
  });

  it('hides profile fields for tag kind', () => {
    render(<AdminEntityFormFields kind="tag" {...baseProps} />);

    expect(screen.getByPlaceholderText('admin.form.namePlaceholder')).toBeTruthy();
    expect(screen.queryByText('admin.form.description')).toBeNull();
    expect(screen.queryByTestId('photo-upload')).toBeNull();
  });
});
