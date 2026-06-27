import { useMemo } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { getBoostySupportUrl } from '../../constants/supportLinks';
import { trackEvent } from '../../utils/analytics';
import { Button, Icon } from '../ui';

function openBoostySupport(url: string): void {
  trackEvent('support_click', { platform: 'boosty' });
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function SupportMenu() {
  const { t } = useTranslation();
  const boostyUrl = useMemo(() => getBoostySupportUrl(), []);

  if (!boostyUrl) return null;

  return (
    <Button
      variant="secondary"
      size="sm"
      className="header-support-btn"
      onClick={() => openBoostySupport(boostyUrl)}
      aria-label={t('support.menuAria')}
      title={t('support.menuAria')}
    >
      <Icon name="local_cafe" size="sm" />
      <span class="header-support-label">{t('support.menu')}</span>
    </Button>
  );
}
