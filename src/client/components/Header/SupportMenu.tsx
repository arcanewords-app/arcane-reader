import { useMemo, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { AppLocale } from '../../i18n';
import {
  getOrderedSupportPlatforms,
  getSupportLinks,
  type SupportPlatform,
} from '../../constants/supportLinks';
import { trackEvent } from '../../utils/analytics';
import { Button, Icon } from '../ui';

const PLATFORM_LABEL_KEYS: Record<SupportPlatform, { title: string; hint: string }> = {
  boosty: { title: 'support.boosty', hint: 'support.boostyHint' },
  bmc: { title: 'support.bmc', hint: 'support.bmcHint' },
};

function trackSupportClick(platform: SupportPlatform): void {
  trackEvent('support_click', { platform });
}

function openSupportUrl(url: string, platform: SupportPlatform): void {
  trackSupportClick(platform);
  window.open(url, '_blank', 'noopener,noreferrer');
}

interface SupportMenuProps {
  locale: AppLocale;
}

export function SupportMenu({ locale }: SupportMenuProps) {
  const { t } = useTranslation();
  const [supportOpen, setSupportOpen] = useState(false);

  const links = useMemo(() => getSupportLinks(), []);
  const platforms = useMemo(() => getOrderedSupportPlatforms(locale, links), [locale, links]);
  const platformCount = platforms.length;

  if (platformCount === 0) return null;

  const handleBlur = () => {
    setTimeout(() => setSupportOpen(false), 150);
  };

  const singlePlatform = platformCount === 1 ? platforms[0] : undefined;
  const singleUrl = singlePlatform ? links[singlePlatform] : undefined;

  if (singlePlatform && singleUrl) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className="header-support-btn"
        onClick={() => openSupportUrl(singleUrl, singlePlatform)}
        aria-label={t('support.menuAria')}
        title={t('support.menuAria')}
      >
        <Icon name="local_cafe" size="sm" />
        <span class="header-support-label">{t('support.menu')}</span>
      </Button>
    );
  }

  return (
    <div class="header-support-wrap">
      <Button
        variant="secondary"
        size="sm"
        className="header-support-btn"
        onClick={() => setSupportOpen((o) => !o)}
        onBlur={handleBlur}
        aria-expanded={supportOpen}
        aria-haspopup="true"
        aria-label={t('support.menuAria')}
        title={t('support.menuAria')}
      >
        <Icon name="local_cafe" size="sm" />
        <span class="header-support-label">{t('support.menu')}</span>
      </Button>
      {supportOpen && (
        <div class="header-support-dropdown" role="menu">
          {platforms.map((platform, index) => {
            const url = links[platform];
            if (!url) return null;
            const keys = PLATFORM_LABEL_KEYS[platform];
            const showRecommended = index === 0;
            return (
              <a
                key={platform}
                href={url}
                class="header-support-item"
                role="menuitem"
                target="_blank"
                rel="noopener noreferrer"
                title={t('support.opensExternal')}
                onClick={(e) => {
                  e.preventDefault();
                  openSupportUrl(url, platform);
                  setSupportOpen(false);
                }}
              >
                <span class="header-support-item-body">
                  <span class="header-support-item-title">{t(keys.title)}</span>
                  <span class="header-support-item-hint">
                    {t(keys.hint)}
                    {showRecommended && (
                      <>
                        {' · '}
                        <span class="header-support-recommended">{t('support.recommended')}</span>
                      </>
                    )}
                  </span>
                </span>
                <Icon name="open_in_new" size="sm" className="header-support-item-icon" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
