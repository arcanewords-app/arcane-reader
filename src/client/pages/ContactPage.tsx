import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { CONTACT_EMAIL } from '../../shared/contact';
import { useStaticPageMeta } from '../hooks/useStaticPageMeta';
import './InfoPages.css';

export function ContactPage() {
  const { t } = useTranslation();
  useStaticPageMeta('/contact');

  return (
    <div class="info-page">
      <div class="info-page-content">
        <button
          type="button"
          class="info-page-back"
          onClick={() => route('/')}
          aria-label={t('common.back')}
        >
          ← {t('common.back')}
        </button>

        <h1 class="info-page-title">{t('contact.title')}</h1>

        <section class="info-section">
          <p>{t('contact.desc')}</p>
          <p class="contact-email">
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        </section>

        <section class="info-section">
          <h2>{t('contact.topics')}</h2>
          <ul>
            <li>{t('contact.topic1')}</li>
            <li>{t('contact.topic2')}</li>
            <li>{t('contact.topic3')}</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
