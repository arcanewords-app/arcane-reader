import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { CONTACT_EMAIL } from '../../shared/contact';
import './InfoPages.css';

export function TermsPage() {
  const { t } = useTranslation();

  return (
    <div class="info-page">
      <div class="info-page-content info-page-legal">
        <button
          type="button"
          class="info-page-back"
          onClick={() => route('/')}
          aria-label={t('common.back')}
        >
          ← {t('common.back')}
        </button>

        <h1 class="info-page-title">{t('terms.title')}</h1>
        <p class="info-page-updated">{t('terms.updated')}</p>

        <section class="info-section">
          <h2>{t('terms.acceptance')}</h2>
          <p>{t('terms.acceptanceDesc')}</p>
        </section>

        <section class="info-section">
          <h2>{t('terms.readers')}</h2>
          <p>{t('terms.readersDesc')}</p>
        </section>

        <section class="info-section">
          <h2>{t('terms.authors')}</h2>
          <p>{t('terms.authorsDesc')}</p>
        </section>

        <section class="info-section">
          <h2>{t('terms.contentResponsibility')}</h2>
          <p>{t('terms.contentResponsibilityDesc')}</p>
        </section>

        <section class="info-section">
          <h2>{t('terms.changes')}</h2>
          <p>{t('terms.changesDesc')}</p>
        </section>

        <section class="info-section">
          <h2>{t('terms.contact')}</h2>
          <p>{t('terms.contactDesc', { contactEmail: CONTACT_EMAIL })}</p>
        </section>
      </div>
    </div>
  );
}
