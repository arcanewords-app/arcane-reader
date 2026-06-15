/**
 * Shared gender agreement rules for Belarusian target (наркамаўka).
 */

export const GENDER_AGREEMENT_BE = `
## Gender agreement (Belarusian)

The source language may lack grammatical gender. Use glossary gender tags as SSOT for each character.

### Rules
1. **Glossary wins**: When a character has [m] or [f] in the cast/glossary, agree verbs, short adjectives, and pronouns (ён/яна, устаў/устала) with that gender — even when the source is ambiguous (他/她, 그, they).
2. **Past-tense verbs** about a named character must match gender.
3. **Dialogue attribution** (сказаў/сказала, спытаў/спытала) must match the speaker's gender.
4. **Do not flip gender** mid-scene unless the plot requires it.
5. When gender is [?], infer only if unambiguous; otherwise use neutral phrasing or repeat the name.
6. Maintain official Belarusian orthography (і, ў, ё).

### What to fix (editing)
- ён/яна mismatches for characters with known glossary gender
- verb/adjective agreement errors tied to a character
- Russian-only forms where Belarusian gender agreement differs`;
