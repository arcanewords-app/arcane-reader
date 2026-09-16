// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_READER_SETTINGS } from '../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { ReaderSettingsPanel } from './ReaderSettings.js';

describe('ReaderSettingsPanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders settings panel with current values', () => {
    render(<ReaderSettingsPanel settings={DEFAULT_READER_SETTINGS} onChange={vi.fn()} />);

    expect(document.querySelector('.reader-settings-panel')).toBeTruthy();
    expect(screen.getByText('reader.font')).toBeTruthy();
    expect(screen.getByText('reader.theme')).toBeTruthy();
    expect(screen.getByText(`${DEFAULT_READER_SETTINGS.fontSize}px`)).toBeTruthy();
  });

  it('calls onChange when indent toggle is clicked', () => {
    const onChange = vi.fn();
    render(
      <ReaderSettingsPanel
        settings={{ ...DEFAULT_READER_SETTINGS, textIndent: false }}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('reader.indentOn'));
    expect(onChange).toHaveBeenCalledWith({ textIndent: true });
  });

  it('calls onChange when text align toggle is clicked', () => {
    const onChange = vi.fn();
    render(
      <ReaderSettingsPanel
        settings={{ ...DEFAULT_READER_SETTINGS, textAlign: 'justify' }}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('reader.alignLeft'));
    expect(onChange).toHaveBeenCalledWith({ textAlign: 'left' });
  });

  it('calls onChange when hide chapter header checkbox toggles', () => {
    const onChange = vi.fn();
    render(
      <ReaderSettingsPanel
        settings={{ ...DEFAULT_READER_SETTINGS, hideChapterHeader: false }}
        onChange={onChange}
      />
    );

    const checkbox = screen.getByLabelText('reader.hideChapterHeader') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ hideChapterHeader: true });
  });

  it('calls onChange when theme option is selected', () => {
    const onChange = vi.fn();
    render(
      <ReaderSettingsPanel
        settings={{ ...DEFAULT_READER_SETTINGS, colorScheme: 'dark' }}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByTitle('reader.themeLight'));
    expect(onChange).toHaveBeenCalledWith({ colorScheme: 'light' });
  });

  it('calls onChange when paper theme is selected', () => {
    const onChange = vi.fn();
    render(
      <ReaderSettingsPanel
        settings={{ ...DEFAULT_READER_SETTINGS, colorScheme: 'dark' }}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByTitle('reader.themePaper'));
    expect(onChange).toHaveBeenCalledWith({ colorScheme: 'paper' });
  });

  it('calls onChange when font family is changed', () => {
    const onChange = vi.fn();
    render(<ReaderSettingsPanel settings={DEFAULT_READER_SETTINGS} onChange={onChange} />);

    const select = screen.getByLabelText('reader.font') as HTMLSelectElement;
    select.value = 'eb_garamond';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith({ fontFamily: 'eb_garamond' });
  });

  it('calls onChange when font size slider moves', () => {
    const onChange = vi.fn();
    render(<ReaderSettingsPanel settings={DEFAULT_READER_SETTINGS} onChange={onChange} />);

    fireEvent.input(screen.getByLabelText('reader.fontSize'), { target: { value: '20' } });
    expect(onChange).toHaveBeenCalledWith({ fontSize: 20 });
  });

  it('calls onChange when line height slider moves', () => {
    const onChange = vi.fn();
    render(<ReaderSettingsPanel settings={DEFAULT_READER_SETTINGS} onChange={onChange} />);

    fireEvent.input(screen.getByLabelText('reader.lineHeight'), { target: { value: '180' } });
    expect(onChange).toHaveBeenCalledWith({ lineHeight: 1.8 });
  });

  it('calls onChange when paragraph spacing slider moves', () => {
    const onChange = vi.fn();
    render(<ReaderSettingsPanel settings={DEFAULT_READER_SETTINGS} onChange={onChange} />);

    fireEvent.input(screen.getByLabelText('reader.paragraphSpacing'), { target: { value: '12' } });
    expect(onChange).toHaveBeenCalledWith({ paragraphSpacing: 1.2 });
  });

  it('calls onChange when container width slider moves', () => {
    const onChange = vi.fn();
    render(
      <ReaderSettingsPanel
        settings={{ ...DEFAULT_READER_SETTINGS, containerWidth: 69 }}
        onChange={onChange}
      />
    );

    fireEvent.input(screen.getByLabelText('reader.containerWidth'), { target: { value: '89' } });
    expect(onChange).toHaveBeenCalledWith({ containerWidth: 89 });

    fireEvent.input(screen.getByLabelText('reader.containerWidth'), { target: { value: '50' } });
    expect(onChange).toHaveBeenCalledWith({ containerWidth: 50 });
  });
});
