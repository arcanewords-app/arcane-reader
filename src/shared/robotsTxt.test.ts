import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { buildRobotsTxt } from './robotsTxt.js';

describe('buildRobotsTxt', () => {
  it('includes disallow rules and sitemap for base URL', () => {
    const body = buildRobotsTxt('https://arcane.example');
    assert.match(body, /User-agent: \*/);
    assert.match(body, /Allow: \//);
    assert.match(body, /Disallow: \/profile/);
    assert.match(body, /Disallow: \/projects/);
    assert.match(body, /Disallow: \/admin/);
    assert.match(body, /Sitemap: https:\/\/arcane\.example\/sitemap\.xml/);
  });
});
