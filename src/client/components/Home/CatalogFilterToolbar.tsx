import { useTranslation } from 'react-i18next';
import { Icon } from '../ui';
import './CatalogFilterToolbar.css';

export interface CatalogFilterToolbarProps {
  targetLanguage: string;
  onTargetLanguageChange: (code: string) => void;
  languageCodes: string[];
  completeOnly: boolean;
  onCompleteOnlyChange: (value: boolean) => void;
  showCompleteFilter: boolean;
  orderAsc: boolean;
  onOrderAscChange: (value: boolean) => void;
}

export function CatalogFilterToolbar({
  targetLanguage,
  onTargetLanguageChange,
  languageCodes,
  completeOnly,
  onCompleteOnlyChange,
  showCompleteFilter,
  orderAsc,
  onOrderAscChange,
}: CatalogFilterToolbarProps) {
  const { t } = useTranslation();

  return (
    <div class="catalog-filter-toolbar" role="toolbar">
      <div
        class="catalog-filter-group catalog-filter-lang-group"
        role="group"
        aria-label={t('home.targetLanguageLabel')}
      >
        <button
          type="button"
          class={`catalog-filter-chip${targetLanguage === '' ? ' catalog-filter-chip--active' : ''}`}
          aria-pressed={targetLanguage === ''}
          aria-label={t('home.languageAll')}
          title={t('home.languageAll')}
          onClick={() => onTargetLanguageChange('')}
        >
          <Icon name="language" size="sm" />
        </button>
        {languageCodes.map((code) => {
          const label = t(`language.${code}`) || code.toUpperCase();
          const isActive = targetLanguage === code;
          return (
            <button
              key={code}
              type="button"
              class={`catalog-filter-chip catalog-filter-chip--lang${isActive ? ' catalog-filter-chip--active' : ''}`}
              aria-pressed={isActive}
              aria-label={label}
              title={label}
              onClick={() => onTargetLanguageChange(code)}
            >
              <span class="catalog-filter-lang-code">{code.toUpperCase()}</span>
            </button>
          );
        })}
      </div>

      {showCompleteFilter && (
        <button
          type="button"
          class={`catalog-filter-chip catalog-filter-chip--complete${completeOnly ? ' catalog-filter-chip--active' : ''}`}
          aria-pressed={completeOnly}
          aria-label={t('home.filterCompleteOnlyAria')}
          title={t('home.filterCompleteOnlyAria')}
          onClick={() => onCompleteOnlyChange(!completeOnly)}
        >
          <Icon name="check_circle" size="sm" />
        </button>
      )}

      <div class="catalog-filter-group catalog-filter-segment" role="group">
        <button
          type="button"
          class={`catalog-filter-segment-btn${!orderAsc ? ' catalog-filter-segment-btn--active' : ''}`}
          aria-pressed={!orderAsc}
          aria-label={t('home.orderNewest')}
          title={t('home.orderNewest')}
          onClick={() => onOrderAscChange(false)}
        >
          <Icon name="arrow_downward" size="sm" />
        </button>
        <button
          type="button"
          class={`catalog-filter-segment-btn${orderAsc ? ' catalog-filter-segment-btn--active' : ''}`}
          aria-pressed={orderAsc}
          aria-label={t('home.orderOldest')}
          title={t('home.orderOldest')}
          onClick={() => onOrderAscChange(true)}
        >
          <Icon name="arrow_upward" size="sm" />
        </button>
      </div>
    </div>
  );
}
