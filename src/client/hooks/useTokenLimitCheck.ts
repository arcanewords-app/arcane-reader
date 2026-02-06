import { useState, useCallback } from 'preact/hooks';
import { authService } from '../services/authService';
import { useTokenUsageContext } from '../contexts/TokenUsageContext';

const WARNING_THRESHOLD = 0.8; // 80%
/** tokensLimit < 0 means unlimited (e.g. admin) */
const isUnlimited = (limit: number) => limit < 0;

export type TokenLimitCheckResult = 'ok' | 'warn' | 'block';

export interface TokenLimitWarningState {
  isOpen: boolean;
  estimatedTokens: number;
  willExceed: boolean;
  onProceed: (() => void) | null;
}

/**
 * Hook: check limit before translation, show TokenLimitWarning on warn/block.
 * Uses shared TokenUsageContext (single refresh interval for the app).
 */
export function useTokenLimitCheck() {
  const { usage: tokenUsage, refresh: loadTokenUsage } = useTokenUsageContext();
  const [warningState, setWarningState] = useState<TokenLimitWarningState>({
    isOpen: false,
    estimatedTokens: 0,
    willExceed: false,
    onProceed: null,
  });

  const checkBeforeTranslate = useCallback(
    (estimatedTokens: number, onProceed: () => void): TokenLimitCheckResult => {
      if (!tokenUsage || !authService.isAuthenticated()) {
        onProceed();
        return 'ok';
      }
      if (isUnlimited(tokenUsage.tokensLimit)) {
        onProceed();
        return 'ok';
      }
      const tokensAfter = tokenUsage.tokensUsed + estimatedTokens;
      const willExceed = tokensAfter > tokenUsage.tokensLimit;
      const percentageAfter = (tokensAfter / tokenUsage.tokensLimit) * 100;
      const shouldWarn = percentageAfter >= WARNING_THRESHOLD * 100;

      if (willExceed) {
        setWarningState({
          isOpen: true,
          estimatedTokens,
          willExceed: true,
          onProceed: null,
        });
        return 'block';
      }
      if (shouldWarn) {
        setWarningState({
          isOpen: true,
          estimatedTokens,
          willExceed: false,
          onProceed,
        });
        return 'warn';
      }
      onProceed();
      return 'ok';
    },
    [tokenUsage]
  );

  const closeWarning = useCallback(() => {
    setWarningState((prev) => ({ ...prev, isOpen: false, onProceed: null }));
  }, []);

  const confirmAndProceed = useCallback(() => {
    if (warningState.onProceed) {
      warningState.onProceed();
    }
    closeWarning();
  }, [warningState.onProceed, closeWarning]);

  return {
    tokenUsage,
    loadTokenUsage,
    checkBeforeTranslate,
    warningState,
    closeWarning,
    confirmAndProceed,
  };
}
