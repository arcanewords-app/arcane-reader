import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import './InfoPages.css';

export function AboutPage() {
  const { t } = useTranslation();

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

        <h1 class="info-page-title">{t('about.title')}</h1>

        <section class="info-section">
          <h2>{t('about.whatIs')}</h2>
          <p>{t('about.whatIsDesc')}</p>
        </section>

        <section class="info-section">
          <h2>{t('about.features')}</h2>
          <ul>
            <li>{t('about.feature1')}</li>
            <li>{t('about.feature2')}</li>
            <li>{t('about.feature3')}</li>
            <li>{t('about.feature4')}</li>
            <li>{t('about.feature5')}</li>
            <li>{t('about.feature6')}</li>
          </ul>
          <p>
            <a
              href="/account-tiers"
              onClick={(e) => {
                e.preventDefault();
                route('/account-tiers');
              }}
            >
              {t('about.accountTiersLink')}
            </a>
          </p>
        </section>

        <section class="info-section">
          <h2>{t('about.mission')}</h2>
          <p>{t('about.missionDesc')}</p>
        </section>

        <section class="info-section">
          <h2>{t('about.author')}</h2>
          <p>
            {t('about.authorDesc')}{' '}
            <a
              href="https://www.linkedin.com/in/ilya-murashka-4a9ba116b/"
              target="_blank"
              rel="noopener noreferrer"
            >
              LinkedIn
            </a>
          </p>
        </section>

        <section class="info-section">
          <h2>{t('about.license')}</h2>
          <p>{t('about.licenseDesc')}</p>
        </section>
      </div>
    </div>
  );
}
