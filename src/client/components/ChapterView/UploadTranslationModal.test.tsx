// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key),
  }),
}));

import { UploadTranslationModal } from './UploadTranslationModal.js';

describe('UploadTranslationModal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.clearAllMocks();
  });

  it('renders when open with chapter title', () => {
    render(
      <UploadTranslationModal
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        chapterTitle="Chapter 3"
      />
    );

    expect(screen.getByText('Chapter 3')).toBeTruthy();
    expect(document.querySelector('.upload-translation-modal-textarea')).toBeTruthy();
    expect(document.querySelector('.modal-overlay')).toBeTruthy();
  });

  it('opens file picker when choose file is clicked', () => {
    render(<UploadTranslationModal isOpen onClose={vi.fn()} onSubmit={vi.fn()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByText('Выбрать файл TXT'));
    expect(clickSpy).toHaveBeenCalled();
  });

  it('submits trimmed text and closes on success', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(<UploadTranslationModal isOpen onClose={onClose} onSubmit={onSubmit} />);

    const textarea = document.querySelector(
      '.upload-translation-modal-textarea'
    ) as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: '  Hello world  ' } });
    fireEvent.click(screen.getByText('Загрузить'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('Hello world');
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('keeps upload disabled when textarea is empty', () => {
    render(<UploadTranslationModal isOpen onClose={vi.fn()} onSubmit={vi.fn()} />);

    const uploadBtn = screen.getByText('Загрузить') as HTMLButtonElement;
    expect(uploadBtn.disabled).toBe(true);
  });
});
