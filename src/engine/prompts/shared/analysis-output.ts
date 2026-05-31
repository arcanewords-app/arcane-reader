/**
 * Shared JSON output schema for Stage 1 analysis (identical across language pairs).
 */

export const ANALYSIS_JSON_OUTPUT_FORMAT = `## Output Format

\`\`\`json
{
  "characters": [
    {
      "name": "original name in source language",
      "suggestedTranslation": "suggested translation/transliteration",
      "gender": "male|female|neutral|unknown",
      "role": "protagonist|antagonist|supporting|minor",
      "description": "brief description",
      "context": "first appearance context"
    }
  ],
  "locations": [
    {
      "name": "original name",
      "suggestedTranslation": "suggested translation",
      "type": "city|country|building|region|world|other",
      "description": "brief description"
    }
  ],
  "terms": [
    {
      "term": "original term",
      "suggestedTranslation": "suggested translation",
      "category": "skill|magic|item|title|organization|race|other",
      "description": "meaning and usage"
    }
  ],
  "updatedCharacters": [
    {
      "originalName": "exact original name from existing glossary",
      "description": "refined or expanded description from this chapter",
      "suggestedTranslation": "refined translation if this chapter suggests a better one"
    }
  ],
  "updatedLocations": [
    {
      "originalName": "exact original name from existing glossary",
      "description": "refined description",
      "suggestedTranslation": "refined translation"
    }
  ],
  "updatedTerms": [
    {
      "originalTerm": "exact original term from existing glossary",
      "description": "refined meaning/usage",
      "suggestedTranslation": "refined translation",
      "category": "skill|magic|item|title|organization|race|other"
    }
  ],
  "chapterSummary": "2-3 sentence summary of events",
  "keyEvents": ["event 1", "event 2"],
  "mood": "chapter mood/atmosphere",
  "styleNotes": "notable stylistic elements"
}
\`\`\`

- **characters / locations / terms**: Only NEW entities not already in the existing glossary.
- **updatedCharacters / updatedLocations / updatedTerms**: Entities that ARE already in the existing glossary and appear in this chapter. Include an entry here only when you have new or improved information (e.g. refined description, better translation from context). Use the exact original name/term as in the glossary to identify the entry. Omit any field you do not want to change.`;

export const ANALYSIS_EXCLUDE_RULES = `## CRITICAL: What to EXCLUDE

### Locations - DO NOT extract:
- Generic/common place descriptions: "dirt road", "forest path", "mountain trail", "river bank"
- Common geographical features: "pond", "lake", "hill", "valley", "field", "meadow"
- Generic building types: "inn", "tavern", "shop", "house" (unless it's a specific named place)
- Common objects used as locations: "tree", "oak", "rock", "boulder"
- Descriptive phrases: "dark alley", "empty street", "quiet room"

### Locations - DO extract:
- Named places: "Crystal Palace", "Silver League", "Sea of Leaves" (if it's a proper name)
- Unique world-building locations: "The Forbidden City", "The Tower of Babel"
- Specific named buildings: "The Grand Library", "The King's Castle" (if it's a recurring location)
- Fictional countries/regions: "The Northern Kingdom", "The Eastern Empire"

### Terms - DO NOT extract:
- Common nouns that can be translated normally: "staff", "sword", "book", "viper", "snake"
- Generic descriptive words: "sacrilege", "betrayal", "honor"
- Common vocabulary that doesn't need special treatment

### Terms - DO extract:
- Unique concepts specific to the story: "mana", "chi", "essence"
- Special skills/abilities: "Shadow Step", "Fireball", "Healing Touch"
- Magic system terms: "spell circle", "rune", "enchantment" (if they're unique to the world)
- Titles/ranks: "Archmage", "Grandmaster", "High Priest"
- Organizations: "The Order", "The Guild", "The Council"
- Special items with unique names: "The Sword of Truth", "The Ring of Power"

### General Rule:
Only extract elements that:
1. Are PROPER NOUNS or have CAPITALIZED names (or culturally equivalent named entities in CJK)
2. Appear MULTIPLE TIMES in the text
3. Are UNIQUE to the story/world (not common vocabulary)
4. Require CONSISTENT translation across chapters

If in doubt, DO NOT extract it. It's better to have fewer, high-quality entries than many generic ones.

## Quality Check

Before including an element, ask:
1. Is this a proper noun or unique concept?
2. Does it appear multiple times or is it important to the story?
3. Does it need consistent translation across chapters?
4. Is it unique to this story, not common vocabulary?

If the answer to any is "no", DO NOT include it.`;
