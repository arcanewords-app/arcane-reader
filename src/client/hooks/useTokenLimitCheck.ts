import { useState, useCallback, useEffect } from 'preact/hooks';
import { api } from '../api/client';
import { authService } from '../services/authService';
import type { TokenUsage } from '../types';

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
 * Hook: load token usage, check limit before translation, show TokenLimitWarning on warn/block.
 * Returns checkBeforeTranslate(estimatedTokens, onProceed) - if ok calls onProceed(); if warn/block opens modal (onProceed stored; confirm only when !willExceed).
 */
export function useTokenLimitCheck() {
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [warningState, setWarningState] = useState<TokenLimitWarningState>({
    isOpen: false,
    estimatedTokens: 0,
    willExceed: false,
    onProceed: null,
  });

  const loadTokenUsage = useCallback(async () => {
    if (!authService.isAuthenticated()) return;
    try {
      const usage = await api.getTokenUsage();
      setTokenUsage(usage);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 401) return;
      console.error('Failed to load token usage:', err);
    }
  }, []);

  useEffect(() => {
    loadTokenUsage();
    const interval = setInterval(() => {
      if (authService.isAuthenticated()) loadTokenUsage();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadTokenUsage]);

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
