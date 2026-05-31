/**
 * SSOT: analyzer prose fields (descriptions, chapter summary, etc.) use target language,
 * not source script. Appended in Stage 1 and in analyzer user Rules for all pairs.
 */

export function buildGlossaryMetadataLanguageRule(targetLanguageLabel: string): string {
  return `## Glossary and chapter metadata language

Write all **prose** fields in **${targetLanguageLabel}** (the translation target language), not in the source language or script.

**Keep in source language/script (as in the chapter):**
- \`name\`, \`term\`, \`originalName\`, \`originalTerm\`

**Write in ${targetLanguageLabel}:**
- \`description\`, \`context\` on new entities
- \`description\` (and other prose) in \`updatedCharacters\`, \`updatedLocations\`, \`updatedTerms\`
- \`chapterSummary\`, \`keyEvents\`, \`mood\`, \`styleNotes\`
- \`suggestedTranslation\` when the target uses Cyrillic (e.g. Russian names for CJK/Latin sources)

Do not put Chinese, Korean, or English explanatory text in \`description\` when the target is ${targetLanguageLabel}.`;
}
