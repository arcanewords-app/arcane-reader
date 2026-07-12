import { useState, useCallback } from 'preact/hooks';
import { authService } from '../services/authService';
import { useTokenUsageContext } from '../contexts/TokenUsageContext';
import { checkTokenLimitStatus, type TokenLimitCheckResult } from '../utils/tokenLimitStatus.js';

export type { TokenLimitCheckResult } from '../utils/tokenLimitStatus.js';
export { checkTokenLimitStatus } from '../utils/tokenLimitStatus.js';

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
      const status = checkTokenLimitStatus(
        tokenUsage,
        estimatedTokens,
        authService.isAuthenticated()
      );
      if (status === 'ok') {
        onProceed();
        return 'ok';
      }
      if (status === 'block') {
        setWarningState({
          isOpen: true,
          estimatedTokens,
          willExceed: true,
          onProceed: null,
        });
        return 'block';
      }
      setWarningState({
        isOpen: true,
        estimatedTokens,
        willExceed: false,
        onProceed,
      });
      return 'warn';
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
