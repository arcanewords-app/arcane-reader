// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_TIER_COLUMNS, TIER_FEATURE_ROWS } from '../../../shared/accountTiers';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

import { RoleComparisonTable } from './RoleComparisonTable.js';

describe('RoleComparisonTable', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders desktop table with feature rows and tier columns', () => {
    render(<RoleComparisonTable />);

    const table = document.querySelector('.role-comparison-table');
    expect(table).toBeTruthy();
    expect(screen.getByText('tiers.featureColumn')).toBeTruthy();

    for (const tierId of ACCOUNT_TIER_COLUMNS) {
      expect(screen.getAllByText(`tiers.columns.${tierId}`).length).toBeGreaterThan(0);
    }

    for (const featureId of TIER_FEATURE_ROWS) {
      expect(screen.getAllByText(`tiers.features.${featureId}`).length).toBeGreaterThan(0);
    }

    expect(document.querySelectorAll('.role-comparison-table tbody tr')).toHaveLength(
      TIER_FEATURE_ROWS.length
    );
  });

  it('highlights current tier column and renders mobile cards', () => {
    render(<RoleComparisonTable currentRole="author" compact className="embedded" />);

    expect(document.querySelector('.role-comparison-compact')).toBeTruthy();
    expect(document.querySelector('.embedded')).toBeTruthy();
    expect(screen.getAllByText('tiers.currentTier').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.role-comparison-card')).toHaveLength(
      ACCOUNT_TIER_COLUMNS.length
    );
  });
});
