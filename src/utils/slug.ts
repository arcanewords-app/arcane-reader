/**
 * Slug generation for SEO-friendly URLs (e.g. "Зенит Колдовства" -> "zenit-koldovstva").
 */

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  і: 'i', ї: 'yi', є: 'ye', ґ: 'g',
};
const CYRILLIC_RE = /[\u0400-\u04FF]/;

function transliterateToLatin(text: string): string {
  return text
    .split('')
    .map((c) => {
      const lower = c.toLowerCase();
      const mapped = CYRILLIC_TO_LATIN[lower];
      if (mapped !== undefined) return mapped;
      return CYRILLIC_RE.test(c) ? '' : c;
    })
    .join('');
}

/**
 * Convert title to URL-safe slug (lowercase, hyphens, alphanumeric).
 * Max 80 chars to leave room for uniqueness suffix.
 */
export function titleToSlug(title: string): string {
  const transliterated = transliterateToLatin(title);
  const slug = transliterated
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return slug || 'publication';
}
