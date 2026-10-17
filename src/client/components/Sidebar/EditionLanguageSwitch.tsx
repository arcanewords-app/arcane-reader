import { useTranslation } from 'react-i18next';

interface EditionLanguageSwitchProps {
  primaryLanguage: string;
  editionLanguages: string[];
  activeLanguage: string;
  onSelect: (language: string) => void;
  onAdd?: () => void;
  canAdd?: boolean;
}

/** Short language codes. Hidden when the project has only its primary target. */
export function EditionLanguageSwitch({
  primaryLanguage,
  editionLanguages,
  activeLanguage,
  onSelect,
  onAdd,
  canAdd = false,
}: EditionLanguageSwitchProps) {
  const { t } = useTranslation();
  if (editionLanguages.length === 0 && !canAdd) return null;
  const codes = [primaryLanguage, ...editionLanguages];
  return (
    <div class="edition-language-switch" role="group" aria-label={t('edition.switchLabel')}>
      {codes.map((code) => {
        const active = code === activeLanguage;
        const label = t(`language.${code}`) || code.toUpperCase();
        return (
          <button
            key={code}
            type="button"
            class={`edition-language-switch-btn ${active ? 'is-active' : ''}`}
            aria-pressed={active}
            aria-label={label}
            onClick={() => onSelect(code)}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
      {canAdd && onAdd && (
        <button
          type="button"
          class="edition-language-switch-btn"
          onClick={onAdd}
          aria-label={t('edition.add')}
        >
          +
        </button>
      )}
    </div>
  );
}
