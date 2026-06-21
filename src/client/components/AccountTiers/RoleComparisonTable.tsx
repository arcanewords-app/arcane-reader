import { useTranslation } from 'react-i18next';
import {
  ACCOUNT_TIER_COLUMNS,
  TIER_FEATURE_ROWS,
  TIER_FEATURE_MATRIX,
  TIER_MODEL_ACCESS_MATRIX,
  getDailyTokenLimitForTier,
  roleToAccountTier,
  type AccountTierId,
  type TierFeatureId,
  type TierModelAccessLevel,
} from '../../../shared/accountTiers';
import type { UserRole } from '../../../types/roles';
import { Icon } from '../ui';
import './RoleComparisonTable.css';

export interface RoleComparisonTableProps {
  /** Highlight the column for the viewer's current role. */
  currentRole?: UserRole;
  /** Denser layout for embedded contexts (UpgradeScreen). */
  compact?: boolean;
  className?: string;
}

function StatusCell({ status, label }: { status: 'yes' | 'no' | 'soon'; label: string }) {
  const { t } = useTranslation();

  if (status === 'yes') {
    return (
      <span class="tier-status tier-status-yes" title={label} aria-label={label}>
        <Icon name="check" size="sm" />
      </span>
    );
  }
  if (status === 'soon') {
    return (
      <span
        class="tier-status tier-status-soon"
        title={t('tiers.soonTooltip')}
        aria-label={`${label}: ${t('tiers.soonBadge')}`}
      >
        {t('tiers.soonBadge')}
      </span>
    );
  }
  return (
    <span class="tier-status tier-status-no" title={label} aria-label={label}>
      <Icon name="close" size="sm" />
    </span>
  );
}

function formatTokenLimit(limit: number | 'unlimited', locale: string): string {
  if (limit === 'unlimited') return '∞';
  if (limit === 0) return '—';
  return limit.toLocaleString(locale);
}

function modelAccessLabel(level: TierModelAccessLevel, t: (key: string) => string): string {
  if (level === 'no') return '—';
  return t(`tiers.modelAccess.${level}`);
}

function featureStatus(
  featureId: TierFeatureId,
  tierId: AccountTierId
): 'yes' | 'no' | 'soon' | 'tokens' | 'modelAccess' {
  if (featureId === 'dailyTokens') return 'tokens';
  if (featureId === 'aiModelChoice') return 'modelAccess';
  return TIER_FEATURE_MATRIX[featureId][tierId];
}

export function RoleComparisonTable({
  currentRole,
  compact = false,
  className = '',
}: RoleComparisonTableProps) {
  const { t, i18n } = useTranslation();
  const highlightTier = currentRole ? roleToAccountTier(currentRole) : null;
  const locale = i18n.language || 'ru';

  const featureLabel = (id: TierFeatureId) => t(`tiers.features.${id}`);
  const tierLabel = (id: AccountTierId) => t(`tiers.columns.${id}`);

  return (
    <div class={`role-comparison ${compact ? 'role-comparison-compact' : ''} ${className}`.trim()}>
      {/* Desktop table */}
      <div class="role-comparison-table-wrap" role="region" aria-label={t('tiers.tableAria')}>
        <table class="role-comparison-table">
          <thead>
            <tr>
              <th scope="col" class="role-comparison-feature-col">
                {t('tiers.featureColumn')}
              </th>
              {ACCOUNT_TIER_COLUMNS.map((tierId) => (
                <th
                  key={tierId}
                  scope="col"
                  class={`role-comparison-tier-col ${highlightTier === tierId ? 'is-current' : ''}`}
                >
                  {tierLabel(tierId)}
                  {highlightTier === tierId && (
                    <span class="role-comparison-current-badge">{t('tiers.currentTier')}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIER_FEATURE_ROWS.map((featureId) => (
              <tr key={featureId}>
                <th scope="row" class="role-comparison-feature-col">
                  {featureLabel(featureId)}
                </th>
                {ACCOUNT_TIER_COLUMNS.map((tierId) => {
                  const status = featureStatus(featureId, tierId);
                  const cellLabel = `${featureLabel(featureId)}, ${tierLabel(tierId)}`;
                  return (
                    <td key={tierId} class={highlightTier === tierId ? 'is-current' : undefined}>
                      {status === 'tokens' ? (
                        <span class="tier-token-limit">
                          {formatTokenLimit(getDailyTokenLimitForTier(tierId), locale)}
                        </span>
                      ) : status === 'modelAccess' ? (
                        <span class="tier-model-access">
                          {modelAccessLabel(TIER_MODEL_ACCESS_MATRIX[tierId], t)}
                        </span>
                      ) : (
                        <StatusCell status={status} label={cellLabel} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div class="role-comparison-cards" aria-label={t('tiers.tableAria')}>
        {ACCOUNT_TIER_COLUMNS.map((tierId) => (
          <article
            key={tierId}
            class={`role-comparison-card ${highlightTier === tierId ? 'is-current' : ''}`}
          >
            <h3 class="role-comparison-card-title">
              {tierLabel(tierId)}
              {highlightTier === tierId && (
                <span class="role-comparison-current-badge">{t('tiers.currentTier')}</span>
              )}
            </h3>
            <ul class="role-comparison-card-list">
              {TIER_FEATURE_ROWS.map((featureId) => {
                const status = featureStatus(featureId, tierId);
                return (
                  <li key={featureId} class="role-comparison-card-row">
                    <span class="role-comparison-card-feature">{featureLabel(featureId)}</span>
                    <span class="role-comparison-card-value">
                      {status === 'tokens' ? (
                        <span class="tier-token-limit">
                          {formatTokenLimit(getDailyTokenLimitForTier(tierId), locale)}
                        </span>
                      ) : status === 'modelAccess' ? (
                        <span class="tier-model-access">
                          {modelAccessLabel(TIER_MODEL_ACCESS_MATRIX[tierId], t)}
                        </span>
                      ) : (
                        <StatusCell
                          status={status}
                          label={`${featureLabel(featureId)}, ${tierLabel(tierId)}`}
                        />
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
