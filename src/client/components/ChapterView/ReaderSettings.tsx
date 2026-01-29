import { useTranslation } from 'react-i18next';
import type { ReaderSettings as ReaderSettingsType, ColorScheme, FontFamily } from '../../types';
import './ReaderSettings.css';

interface ReaderSettingsProps {
  settings: ReaderSettingsType;
  onChange: (updates: Partial<ReaderSettingsType>) => void;
}

const fonts: { key: FontFamily; label: string; style: string }[] = [
  { key: 'literary', label: 'Literata', style: "'Literata', serif" },
  { key: 'serif', label: 'Charter', style: "Charter, serif" },
  { key: 'sans', label: 'Inter', style: "Inter, sans-serif" },
  { key: 'mono', label: 'Mono', style: "'JetBrains Mono', monospace" },
];

export function ReaderSettingsPanel({ settings, onChange }: ReaderSettingsProps) {
  const { t } = useTranslation();
  const themes: { key: ColorScheme; icon: string; titleKey: string; preview: string }[] = [
    { key: 'dark', icon: '🌙', titleKey: 'reader.themeDark', preview: 'theme-preview-dark' },
    { key: 'light', icon: '☀️', titleKey: 'reader.themeLight', preview: 'theme-preview-light' },
    { key: 'sepia', icon: '📜', titleKey: 'reader.themeSepia', preview: 'theme-preview-sepia' },
    { key: 'contrast', icon: '🔳', titleKey: 'reader.themeContrast', preview: 'theme-preview-contrast' },
  ];
  return (
    <div class="reader-settings-panel">
      <div class="settings-section">
        <label class="settings-label">{t('reader.font')}</label>
        <div class="font-selector">
          {fonts.map((font) => (
            <button
              key={font.key}
              class={`font-option ${settings.fontFamily === font.key ? 'active' : ''}`}
              onClick={() => onChange({ fontFamily: font.key })}
            >
              <span class="font-preview" style={{ fontFamily: font.style }}>
                Аа
              </span>
              <span class="font-name">{font.label}</span>
            </button>
          ))}
        </div>
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
        <label class="settings-label">{t('reader.theme')}</label>
        <div class="theme-selector">
          {themes.map((theme) => (
            <button
              key={theme.key}
              class={`theme-option ${settings.colorScheme === theme.key ? 'active' : ''}`}
              onClick={() => onChange({ colorScheme: theme.key })}
              title={t(theme.titleKey)}
            >
              <span class={`theme-preview ${theme.preview}`}>{theme.icon}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

