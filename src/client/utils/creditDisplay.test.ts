import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  creditColorClass,
  creditsAfterEstimate,
  creditsRemaining,
  getCreditDisplay,
  isUnlimitedCreditLimit,
} from './creditDisplay.js';

describe('creditDisplay', () => {
  it('treats negative limit as unlimited', () => {
    assert.equal(isUnlimitedCreditLimit(-1), true);
    assert.equal(isUnlimitedCreditLimit(50000), false);
    assert.equal(creditsRemaining({ tokensUsed: 10, tokensLimit: -1 }), -1);
  });

  it('prefers tokensRemaining (includes blocked) over used/limit', () => {
    assert.equal(
      creditsRemaining({
        tokensUsed: 1000,
        tokensBlocked: 500,
        tokensLimit: 10000,
        tokensRemaining: 8500,
      }),
      8500
    );
  });

  it('falls back to limit − used − blocked', () => {
    assert.equal(
      creditsRemaining({ tokensUsed: 1000, tokensBlocked: 500, tokensLimit: 10000 }),
      8500
    );
  });

  it('maps remaining percent to color classes', () => {
    assert.equal(creditColorClass(100), 'normal');
    assert.equal(creditColorClass(51), 'normal');
    assert.equal(creditColorClass(50), 'caution');
    assert.equal(creditColorClass(20), 'warning');
    assert.equal(creditColorClass(5), 'critical');
  });

  it('getCreditDisplay inverts spent quota into remaining bar', () => {
    const display = getCreditDisplay({
      tokensUsed: 8500,
      tokensLimit: 10000,
      tokensRemaining: 1500,
    });
    assert.equal(display.unlimited, false);
    assert.equal(display.remaining, 1500);
    assert.equal(display.remainingPercent, 15);
    assert.equal(display.colorClass, 'warning');
  });

  it('creditsAfterEstimate allows exact remaining spend', () => {
    const after = creditsAfterEstimate(
      { tokensUsed: 8000, tokensLimit: 10000, tokensRemaining: 2000 },
      2000
    );
    assert.equal(after.willExceed, false);
    assert.equal(after.remainingAfter, 0);
  });

  it('creditsAfterEstimate flags overspend', () => {
    const after = creditsAfterEstimate(
      { tokensUsed: 9000, tokensLimit: 10000, tokensRemaining: 1000 },
      2000
    );
    assert.equal(after.willExceed, true);
    assert.equal(after.remainingAfter, 0);
    assert.equal(after.remainingNow, 1000);
  });
});
