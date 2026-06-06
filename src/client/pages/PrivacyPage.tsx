import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { CONTACT_EMAIL } from '../../shared/contact';
import './InfoPages.css';

export function PrivacyPage() {
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

        <h1 class="info-page-title">{t('privacy.title')}</h1>
        <p class="info-page-updated">{t('privacy.updated')}</p>

        <section class="info-section">
          <h2>{t('privacy.controller')}</h2>
          <p>{t('privacy.controllerDesc', { contactEmail: CONTACT_EMAIL })}</p>
        </section>

        <section class="info-section">
          <h2>{t('privacy.dataWeCollect')}</h2>
          <h3>{t('privacy.guests')}</h3>
          <p>{t('privacy.guestsDesc')}</p>
          <h3>{t('privacy.users')}</h3>
          <p>{t('privacy.usersDesc')}</p>
          <h3>{t('privacy.authors')}</h3>
          <p>{t('privacy.authorsDesc')}</p>
        </section>

        <section class="info-section">
          <h2>{t('privacy.purpose')}</h2>
          <p>{t('privacy.purposeDesc')}</p>
        </section>

        <section class="info-section">
          <h2>{t('privacy.operationalLogs')}</h2>
          <p>{t('privacy.operationalLogsDesc')}</p>
        </section>

        <section class="info-section">
          <h2>{t('privacy.localStorage')}</h2>
          <p>{t('privacy.localStorageDesc')}</p>
        </section>

        <section class="info-section">
          <h2>{t('privacy.thirdParty')}</h2>
          <p>{t('privacy.thirdPartyDesc')}</p>
        </section>

        <section class="info-section">
          <h2>{t('privacy.yourRights')}</h2>
          <p>{t('privacy.yourRightsDesc', { contactEmail: CONTACT_EMAIL })}</p>
        </section>

        <section class="info-section">
          <h2>{t('privacy.contact')}</h2>
          <p>{t('privacy.contactDesc', { contactEmail: CONTACT_EMAIL })}</p>
        </section>
      </div>
    </div>
  );
}
