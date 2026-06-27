import type { AppLocale } from '../i18n';

export type SupportPlatform = 'boosty' | 'bmc';

function parseSupportUrl(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('https://')) return undefined;
  try {
    return new URL(trimmed).href;
  } catch {
    return undefined;
  }
}

export function getSupportLinks(): Partial<Record<SupportPlatform, string>> {
  const links: Partial<Record<SupportPlatform, string>> = {};
  const boosty = parseSupportUrl(import.meta.env.VITE_SUPPORT_BOOSTY_URL);
  const bmc = parseSupportUrl(import.meta.env.VITE_SUPPORT_BMC_URL);
  if (boosty) links.boosty = boosty;
  if (bmc) links.bmc = bmc;
  return links;
}

export function getPrimarySupportPlatform(locale: AppLocale): SupportPlatform {
  return locale === 'en' ? 'bmc' : 'boosty';
}

export function getOrderedSupportPlatforms(
  locale: AppLocale,
  links: Partial<Record<SupportPlatform, string>>
): SupportPlatform[] {
  const platforms = Object.keys(links) as SupportPlatform[];
  if (platforms.length <= 1) return platforms;

  const primary = getPrimarySupportPlatform(locale);
  const secondary = primary === 'boosty' ? 'bmc' : 'boosty';
  const ordered: SupportPlatform[] = [];
  if (links[primary]) ordered.push(primary);
  if (links[secondary]) ordered.push(secondary);
  return ordered;
}
