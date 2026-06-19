/**
 * Shared gender agreement rules for Russian target (all source languages).
 * Appended to translator and editor system prompts once per request.
 * See translation-examples.ts for BAD/GOOD patterns.
 */

export const GENDER_AGREEMENT_RU = `
## Gender agreement (Russian)

Use glossary gender tags [m]/[f] as SSOT. See **Translation Examples** above for ambiguous pronouns (they/他/她).

### Rules
1. **Glossary wins**: Agree verbs, short adjectives, and pronouns (он/она, встал/встала) with glossary gender — even when the source is ambiguous.
2. **Dialogue attribution** (сказал/сказала) must match the speaker's gender.
3. When gender is [?], infer only if unambiguous; otherwise repeat the name or use neutral phrasing.`;
