import { Modal } from '../ui';
import { Button } from '../ui';
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
  const tokensAfterTranslation = usage.tokensUsed + estimatedTokens;
  const remainingAfter = Math.max(0, usage.tokensLimit - tokensAfterTranslation);
  const percentageAfter = (tokensAfterTranslation / usage.tokensLimit) * 100;
  const willExceed = tokensAfterTranslation > usage.tokensLimit;
  const isWarning = percentageAfter >= 80 && !willExceed;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={willExceed ? '⚠️ Лимит токенов превышен' : '⚠️ Предупреждение о лимите токенов'}
      size="default"
    >
      <div class="token-limit-warning-content">
        {willExceed ? (
          <>
            <p class="token-limit-warning-message">
              Дневной лимит токенов будет превышен при выполнении этого перевода.
            </p>
            <div class="token-limit-warning-stats">
              <div class="token-limit-stat">
                <span class="token-limit-stat-label">Текущее использование:</span>
                <span class="token-limit-stat-value">{usage.tokensUsed.toLocaleString()} / {usage.tokensLimit.toLocaleString()}</span>
              </div>
              <div class="token-limit-stat">
                <span class="token-limit-stat-label">Предполагаемое использование:</span>
                <span class="token-limit-stat-value">{estimatedTokens.toLocaleString()} токенов</span>
              </div>
              <div class="token-limit-stat">
                <span class="token-limit-stat-label">После перевода:</span>
                <span class="token-limit-stat-value critical">{tokensAfterTranslation.toLocaleString()} / {usage.tokensLimit.toLocaleString()}</span>
              </div>
            </div>
            <p class="token-limit-warning-note">
              Лимит токенов сбросится завтра в 00:00 UTC. Попробуйте перевести главу позже или уменьшите размер текста.
            </p>
          </>
        ) : (
          <>
            <p class="token-limit-warning-message">
              После этого перевода у вас останется мало токенов на сегодня.
            </p>
            <div class="token-limit-warning-stats">
              <div class="token-limit-stat">
                <span class="token-limit-stat-label">Текущее использование:</span>
                <span class="token-limit-stat-value">{usage.tokensUsed.toLocaleString()} / {usage.tokensLimit.toLocaleString()}</span>
              </div>
              <div class="token-limit-stat">
                <span class="token-limit-stat-label">Предполагаемое использование:</span>
                <span class="token-limit-stat-value">{estimatedTokens.toLocaleString()} токенов</span>
              </div>
              <div class="token-limit-stat">
                <span class="token-limit-stat-label">Останется после перевода:</span>
                <span class="token-limit-stat-value warning">{remainingAfter.toLocaleString()} токенов</span>
              </div>
              <div class="token-limit-stat">
                <span class="token-limit-stat-label">Использование после перевода:</span>
                <span class="token-limit-stat-value warning">{percentageAfter.toFixed(1)}%</span>
              </div>
            </div>
            <p class="token-limit-warning-note">
              Вы уверены, что хотите продолжить? Лимит токенов сбросится завтра в 00:00 UTC.
            </p>
          </>
        )}
      </div>
      <div class="token-limit-warning-footer">
        <Button variant="secondary" onClick={onClose} size="sm">
          Отмена
        </Button>
        {!willExceed && (
          <Button variant="primary" onClick={handleConfirm} size="sm">
            Продолжить
          </Button>
        )}
      </div>
    </Modal>
  );
}
