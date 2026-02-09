import { useTranslation } from 'react-i18next';
import { Modal, Button } from '../ui';
import type { TokenUsage } from '../../types';
import './TokenLimitWarning.css';

interface TokenLimitWarningProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  usage: TokenUsage;
  estimatedTokens: number;
}

export function TokenLimitWarning({
  isOpen,
  onClose,
  onConfirm,
  usage,
  estimatedTokens,
}: TokenLimitWarningProps) {
  const { t } = useTranslation();
  const unlimited = usage.tokensLimit <= 0;
  const tokensAfterTranslation = usage.tokensUsed + estimatedTokens;
  const remainingAfter = unlimited ? -1 : Math.max(0, usage.tokensLimit - tokensAfterTranslation);
  const percentageAfter =
    unlimited || usage.tokensLimit <= 0 ? 0 : (tokensAfterTranslation / usage.tokensLimit) * 100;
  const willExceed = !unlimited && tokensAfterTranslation > usage.tokensLimit;

  if (unlimited) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={t('tokenUsage.unlimited')} size="default">
        <div class="token-limit-warning-content">
          <p class="token-limit-warning-message">{t('tokenLimit.unlimitedNote')}</p>
        </div>
        <div class="token-limit-warning-footer">
          <Button variant="primary" onClick={onClose} size="sm">
            {t('common.close')}
          </Button>
        </div>
      </Modal>
    );
  }

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        willExceed ? `⚠️ ${t('tokenLimit.titleExceeded')}` : `⚠️ ${t('tokenLimit.titleWarning')}`
      }
      size="default"
    >
      <div class="token-limit-warning-content">
        {willExceed ? (
          <>
            <p class="token-limit-warning-message">{t('tokenLimit.messageExceeded')}</p>
            <div class="token-limit-warning-stats">
              <div class="token-limit-stat">
                <span class="token-limit-stat-label">{t('tokenLimit.currentUsage')}</span>
                <span class="token-limit-stat-value">
                  {usage.tokensUsed.toLocaleString()} / {usage.tokensLimit.toLocaleString()}
                </span>
              </div>
              <div class="token-limit-stat">
                <span class="token-limit-stat-label">{t('tokenLimit.estimatedUsage')}</span>
                <span class="token-limit-stat-value">
                  {estimatedTokens.toLocaleString()} {t('projectInfo.tokensCount')}
                </span>
              </div>
              <div class="token-limit-stat">
                <span class="token-limit-stat-label">{t('tokenLimit.afterTranslation')}</span>
                <span class="token-limit-stat-value critical">
                  {tokensAfterTranslation.toLocaleString()} / {usage.tokensLimit.toLocaleString()}
                </span>
              </div>
            </div>
            <p class="token-limit-warning-note">{t('tokenLimit.noteResetTomorrow')}</p>
          </>
        ) : (
          <>
            <p class="token-limit-warning-message">{t('tokenLimit.messageLow')}</p>
            <div class="token-limit-warning-stats">
              <div class="token-limit-stat">
                <span class="token-limit-stat-label">{t('tokenLimit.currentUsage')}</span>
                <span class="token-limit-stat-value">
                  {usage.tokensUsed.toLocaleString()} / {usage.tokensLimit.toLocaleString()}
                </span>
              </div>
              <div class="token-limit-stat">
                <span class="token-limit-stat-label">{t('tokenLimit.estimatedUsage')}</span>
                <span class="token-limit-stat-value">
                  {estimatedTokens.toLocaleString()} {t('projectInfo.tokensCount')}
                </span>
              </div>
              <div class="token-limit-stat">
                <span class="token-limit-stat-label">{t('tokenLimit.remainingAfter')}</span>
                <span class="token-limit-stat-value warning">
                  {remainingAfter.toLocaleString()} {t('projectInfo.tokensCount')}
                </span>
              </div>
              <div class="token-limit-stat">
                <span class="token-limit-stat-label">{t('tokenLimit.usageAfter')}</span>
                <span class="token-limit-stat-value warning">{percentageAfter.toFixed(1)}%</span>
              </div>
            </div>
            <p class="token-limit-warning-note">{t('tokenLimit.noteConfirm')}</p>
          </>
        )}
      </div>
      <div class="token-limit-warning-footer">
        <Button variant="secondary" onClick={onClose} size="sm">
          {t('common.cancel')}
        </Button>
        {!willExceed && (
          <Button variant="primary" onClick={handleConfirm} size="sm">
            {t('common.continue')}
          </Button>
        )}
      </div>
    </Modal>
  );
}
