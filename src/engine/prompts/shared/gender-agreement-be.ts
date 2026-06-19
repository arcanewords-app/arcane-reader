/**
 * Shared gender agreement rules for Belarusian target (наркамаўka).
 * See translation-examples.ts for BAD/GOOD patterns.
 */

export const GENDER_AGREEMENT_BE = `
## Gender agreement (Belarusian)

Use glossary gender tags [m]/[f] as SSOT. See **Translation Examples** above for ambiguous pronouns.

### Rules
1. **Glossary wins**: Agree verbs, short adjectives, and pronouns (ён/яна, устаў/устала) with glossary gender — even when the source is ambiguous.
2. **Dialogue attribution** (сказаў/сказала) must match the speaker's gender.
3. Maintain official Belarusian orthography (і, ў, ё).
4. When gender is [?], infer only if unambiguous; otherwise repeat the name or use neutral phrasing.`;
