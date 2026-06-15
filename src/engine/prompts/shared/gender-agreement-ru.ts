/**
 * Shared gender agreement rules for Russian target (all source languages).
 * Appended to translator and editor system prompts once per request.
 */

export const GENDER_AGREEMENT_RU = `
## Gender agreement (Russian)

The source language may lack grammatical gender. Use glossary gender tags as SSOT for each character.

### Rules
1. **Glossary wins**: When a character has [m] or [f] in the cast/glossary, agree verbs, short adjectives, and pronouns (он/она, встал/встала, сказал/сказала) with that gender throughout the scene — even when the source uses ambiguous pronouns (他/她, 그, they).
2. **Past-tense verbs** referring to a named character must match gender (увидел/увидела, подумал/подумала).
3. **Dialogue attribution** (сказал/сказала, спросил/спросила) must match the speaker's gender.
4. **Do not flip gender** mid-scene unless the plot explicitly requires it.
5. When gender is [?], infer from context only if unambiguous; otherwise use neutral phrasing or repeat the name.

### What to fix (editing)
- он/она mismatches for a character with known gender in glossary
- встал/встала, готов/готова, рад/рада errors tied to a character
- pronoun agreement in narration about a specific character`;
