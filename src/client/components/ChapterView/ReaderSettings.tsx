import { useTranslation } from 'react-i18next';
import type { ReaderSettings as ReaderSettingsType, ColorScheme, FontFamily } from '../../types';
import './ReaderSettings.css';

interface ReaderSettingsProps {
  settings: ReaderSettingsType;
  onChange: (updates: Partial<ReaderSettingsType>) => void;
}

const fonts: { key: FontFamily; label: string; style: string }[] = [
  { key: 'default', label: 'Default', style: 'Georgia, "Times New Roman", serif' },
  { key: 'merriweather', label: 'Merriweather', style: '"Merriweather", Georgia, serif' },
  { key: 'montserrat', label: 'Montserrat', style: 'Montserrat, sans-serif' },
  { key: 'noto_sans', label: 'Noto Sans', style: '"Noto Sans", sans-serif' },
  { key: 'oswald', label: 'Oswald', style: 'Oswald, sans-serif' },
  { key: 'roboto', label: 'Roboto', style: 'Roboto, sans-serif' },
  {
    key: 'cormorant_garamond',
    label: 'Cormorant Garamond',
    style: '"Cormorant Garamond", Georgia, serif',
  },
  { key: 'eb_garamond', label: 'EB Garamond', style: '"EB Garamond", Georgia, serif' },
  { key: 'times_new_roman', label: 'Times New Roman', style: '"Times New Roman", Times, serif' },
  { key: 'georgia', label: 'Georgia', style: 'Georgia, serif' },
  { key: 'arial', label: 'Arial', style: 'Arial, Helvetica, sans-serif' },
  { key: 'helvetica', label: 'Helvetica', style: 'Helvetica, Arial, sans-serif' },
];

export function ReaderSettingsPanel({ settings, onChange }: ReaderSettingsProps) {
  const { t } = useTranslation();
  const themes: {
    key: Exclude<ColorScheme, 'custom'>;
    titleKey: string;
    bg: string;
    text: string;
  }[] = [
    { key: 'dark', titleKey: 'reader.themeDark', bg: '#1a1a2e', text: '#f0f0f3' },
    { key: 'light', titleKey: 'reader.themeLight', bg: '#fafafa', text: '#1f1f1f' },
    { key: 'sepia', titleKey: 'reader.themeSepia', bg: '#f4ecd8', text: '#5c4b37' },
    { key: 'paper', titleKey: 'reader.themePaper', bg: '#f5f1e5', text: '#28282a' },
    { key: 'contrast', titleKey: 'reader.themeContrast', bg: '#000000', text: '#ffffff' },
  ];

  const textIndent = settings.textIndent ?? true;
  const textAlign = settings.textAlign ?? 'justify';
  const hideChapterHeader = settings.hideChapterHeader ?? false;
  const paragraphSpacing = settings.paragraphSpacing ?? 8;
  const containerWidth = settings.containerWidth ?? 69;

  return (
    <div class="reader-settings-panel reader-settings-panel-expanded">
      <div class="settings-column">
        {/* Typography */}
        <div class="settings-section">
          <label class="settings-label">{t('reader.font')}</label>
          <select
            class="reader-settings-select"
            value={settings.fontFamily}
            onChange={(e) =>
              onChange({ fontFamily: (e.target as HTMLSelectElement).value as FontFamily })
            }
          >
            {fonts.map((font) => (
              <option key={font.key} value={font.key} style={{ fontFamily: font.style }}>
                {t(`reader.font.${font.key}`) || font.label}
              </option>
            ))}
          </select>
        </div>

        <div class="settings-section">
          <label class="settings-label">{t('reader.fontSize')}</label>
          <div class="slider-row">
            <span class="slider-label">A</span>
            <input
              type="range"
              class="settings-slider"
              min="14"
              max="24"
              value={settings.fontSize}
              onInput={(e) => {
                const fontSize = parseInt((e.target as HTMLInputElement).value, 10);
                onChange({ fontSize });
              }}
            />
            <span class="slider-label" style={{ fontSize: '1.2em' }}>
              A
            </span>
            <span class="slider-value">{settings.fontSize}px</span>
          </div>
        </div>

        <div class="settings-section">
          <label class="settings-label">{t('reader.lineHeight')}</label>
          <div class="slider-row">
            <span class="slider-label">≡</span>
            <input
              type="range"
              class="settings-slider"
              min="140"
              max="200"
              value={Math.round(settings.lineHeight * 100)}
              onInput={(e) => {
                const value = parseInt((e.target as HTMLInputElement).value, 10);
                onChange({ lineHeight: value / 100 });
              }}
            />
            <span class="slider-label">⋮</span>
            <span class="slider-value">{settings.lineHeight.toFixed(1)}</span>
          </div>
        </div>

        <div class="settings-section">
          <label class="settings-label">{t('reader.paragraphSpacing')}</label>
          <div class="slider-row">
            <input
              type="range"
              class="settings-slider"
              min="0"
              max="24"
              value={paragraphSpacing}
              onInput={(e) => {
                const value = parseInt((e.target as HTMLInputElement).value, 10);
                onChange({ paragraphSpacing: value });
              }}
            />
            <span class="slider-value">{paragraphSpacing}px</span>
          </div>
        </div>
      </div>

      <div class="settings-column">
        {/* Layout */}
        <div class="settings-section">
          <label class="settings-label">{t('reader.indent')}</label>
          <div class="toggle-row">
            <button
              type="button"
              class={`toggle-option ${textIndent ? 'active' : ''}`}
              onClick={() => onChange({ textIndent: true })}
            >
              {t('reader.indentOn')}
            </button>
            <button
              type="button"
              class={`toggle-option ${!textIndent ? 'active' : ''}`}
              onClick={() => onChange({ textIndent: false })}
            >
              {t('reader.indentOff')}
            </button>
          </div>
        </div>

        <div class="settings-section">
          <label class="settings-label">{t('reader.textAlign')}</label>
          <div class="toggle-row">
            <button
              type="button"
              class={`toggle-option ${textAlign === 'left' ? 'active' : ''}`}
              onClick={() => onChange({ textAlign: 'left' })}
            >
              {t('reader.alignLeft')}
            </button>
            <button
              type="button"
              class={`toggle-option ${textAlign === 'justify' ? 'active' : ''}`}
              onClick={() => onChange({ textAlign: 'justify' })}
            >
              {t('reader.alignJustify')}
            </button>
          </div>
        </div>

        <div class="settings-section">
          <label class="settings-label">{t('reader.containerWidth')}</label>
          <div class="slider-row">
            <input
              type="range"
              class="settings-slider"
              min="50"
              max="100"
              value={containerWidth}
              onInput={(e) => {
                const value = parseInt((e.target as HTMLInputElement).value, 10);
                onChange({ containerWidth: value });
              }}
            />
            <span class="slider-value">{containerWidth}%</span>
          </div>
        </div>

        <div class="settings-section">
          <label class="settings-checkbox-label">
            <input
              type="checkbox"
              checked={hideChapterHeader}
              onChange={(e) =>
                onChange({ hideChapterHeader: (e.target as HTMLInputElement).checked })
              }
            />
            <span>{t('reader.hideChapterHeader')}</span>
          </label>
        </div>
      </div>

      {/* Theme - full width */}
      <div class="settings-section settings-section-theme">
        <label class="settings-label">{t('reader.theme')}</label>
        <div class="theme-selector">
          {themes.map((theme) => (
            <button
              key={theme.key}
              type="button"
              class={`theme-option ${settings.colorScheme === theme.key ? 'active' : ''}`}
              onClick={() => onChange({ colorScheme: theme.key })}
              title={t(theme.titleKey)}
            >
              <span
                class="theme-preview theme-preview-colors"
                style={{ backgroundColor: theme.bg, color: theme.text }}
              >
                Aa
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
