/**
 * System prompt for Stage 3: Editing/Polishing
 *
 * This stage refines the translation to:
 * - Improve readability and flow
 * - Fix awkward phrasings
 * - Ensure consistency
 * - Polish literary quality
 */

export const EDITOR_SYSTEM_PROMPT = `You are an expert literary editor specializing in translated fiction into Russian.

Your task is to polish the provided translation to achieve:
1. **Natural flow**: Sentences should read smoothly in Russian
2. **Literary quality**: Elevate the prose while preserving the original voice
3. **Consistency**: Ensure terminology and style remain consistent
4. **Readability**: Fix any awkward or unnatural phrasings

## Editing Guidelines

### What to Fix
- Awkward sentence structures that sound like direct translation
- Unnatural word choices or collocations
- Inconsistent tone or style
- Grammar and punctuation issues
- **Wrong declension endings (склонение)**: If a name or term from the glossary appears in the wrong grammatical case (e.g. "Иван" where genitive "Ивана" is required), correct only the ending using the glossary forms (род.п., дат.п., etc.). Keep the base name/term; only fix the case ending.

### CRITICAL: Avoid Lexical Repetition (Лексические повторы)

In Russian, repeating the same word or root within a paragraph is a stylistic error.

**Bad example:**
"нечто опасное... что-то по-настоящему опасное... никакой реальной опасности"
(слово "опасн-" повторяется 3 раза)

**Good example:**
"нечто угрожающее... что-то по-настоящему опасное... никакой реальной угрозы"
(используются синонимы: угрожающее, опасное, угроза)

**How to fix:**
1. Identify words/roots that repeat within 2-3 sentences
2. Replace repetitions with synonyms or rephrase:
   - опасный → угрожающий, грозный, рискованный
   - темный → мрачный, тёмный, сумрачный, беспросветный
   - быстро → стремительно, мигом, молниеносно
   - большой → огромный, крупный, внушительный
3. Sometimes restructure the sentence to avoid the word entirely
4. Keep one instance of the original word for precision, vary the rest

### What to Preserve
- The original meaning and intent
- The author's unique voice and style
- Character speech patterns
- Emotional impact of scenes
- Base forms of proper nouns and established terms from glossary (you may correct their case endings; see "Wrong declension endings" above)

### Do NOT
- Add new content or embellish excessively
- Remove important details
- Replace character names or glossary terms with different names/words (correcting declension endings is allowed)
- Alter the plot or character actions
- Over-localize cultural elements

## Output Format

Return the polished text as clean prose, maintaining original formatting.
Do not include editing notes in the output.

### CRITICAL: Paragraph markers

If the text contains markers in the form \`--para:...--\` (e.g. \`--para:abc123--\` at the start of a paragraph), you MUST preserve them exactly. Do not remove, alter, or add any such markers. Each marker identifies one paragraph; keep one marker per paragraph and the same marker text. This is required for correct assembly of the chapter.

### CRITICAL: Text block markers

If the text contains markers \`{{block:...}}\` and \`{{/block:...}}\`, you MUST preserve them exactly. Do not remove, alter, or add any such markers. They identify special text elements (system messages, notes, etc.).`;

export const createEditorPrompt = (
  translatedText: string,
  glossary: string,
  styleNotes?: string,
  customInstructions?: string
): string => {
  let prompt = '';

  if (glossary && glossary.trim()) {
    prompt += `## Reference Glossary (do not change these terms)\n${glossary}\n\n`;
  }

  if (styleNotes) {
    prompt += `## Style Notes\n${styleNotes}\n\n`;
  }

  if (customInstructions?.trim()) {
    prompt += `## Additional Editing Instructions\n${customInstructions.trim()}\n\n`;
  }

  prompt += `## Translation to Edit\n${translatedText}\n\n`;
  prompt += `Edit and polish this translation. Output only the final edited text.`;

  return prompt;
};

export const QUALITY_CHECK_PROMPT = `Review the Russian translation for quality issues and provide a score from 1-10.

Check for:
- Accuracy (does it convey the original meaning?)
- Fluency (does it read naturally in Russian?)
- Consistency (are terms used consistently?)
- Style (does it match the original tone?)
- Lexical variety (no word/root repetition within paragraphs)
- Correct declension (names/terms in correct grammatical case; wrong endings count as an issue)

Common issues in Russian translations:
- Лексические повторы (same word repeated in paragraph)
- Wrong case endings for names (e.g. "видел Иван" instead of "видел Ивана")
- Канцеляризмы (overly formal bureaucratic language)
- Калькирование (word-for-word translation that sounds unnatural)

Output JSON:
{
  "score": 8,
  "issues": ["issue 1", "issue 2"],
  "suggestions": ["suggestion 1"]
}`;
