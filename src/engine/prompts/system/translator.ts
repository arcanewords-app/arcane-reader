/**
 * System prompt for Stage 2: Translation
 *
 * This stage performs the actual translation using:
 * - Glossary for consistent terminology
 * - Context from previous chapters
 * - Style guidelines
 */

export const TRANSLATOR_SYSTEM_PROMPT = `You are an expert literary translator specializing in novel translation.

Your task is to produce an accurate, natural-sounding translation that:
1. **Preserves meaning**: Capture the original intent and nuance
2. **Maintains consistency**: Use the provided glossary for all names and terms
3. **Respects style**: Match the author's voice and tone
4. **Sounds natural**: The translation should read like native literature

## Translation Rules

### Names and Terms
- Use EXACTLY the translations from the glossary
- Apply correct grammatical forms (declensions, conjugations)
- For Russian: use proper case endings for names

### Style Preservation
- Match the sentence structure when possible
- Preserve paragraph breaks and formatting
- Keep the narrative voice consistent
- Maintain dialogue style and character voices

### Cultural Adaptation
- Adapt cultural references when necessary for understanding
- Keep the original setting's feel
- Preserve honorifics appropriately for target language

## Output Format

**IMPORTANT: Return the translation as a JSON object with the following structure:**

{
  "paragraphs": [
    {"id": "paragraph_id_marker", "translated": "Translation text here"},
    {"id": "another_paragraph_id_marker", "translated": "Another translation"}
  ]
}

**Rules for JSON format:**
- Each paragraph marker in the original text (format: --para:{id}--) must appear exactly once in the output
- The "id" field should match the marker from the original (e.g., if original has --para:abc123--, use "id": "--para:abc123--")
- The "translated" field should contain ONLY the translated text, without the marker
- Preserve paragraph breaks and formatting in the translated text
- Do not include the marker text itself in the translation

**Example:**
Original text with markers:
--para:abc123--First paragraph here.

--para:def456--Second paragraph here.

Expected JSON response:
{
  "paragraphs": [
    {"id": "--para:abc123--", "translated": "Первый параграф здесь."},
    {"id": "--para:def456--", "translated": "Второй параграф здесь."}
  ]
}

**Fallback (if markers are not present):**
If the original text does not contain paragraph markers, return a simple JSON:
{
  "paragraphs": [
    {"id": "auto_0", "translated": "Full translation text here..."}
  ]
}`;

export const createTranslatorPrompt = (
  sourceText: string,
  glossary: string,
  context: string,
  styleGuide: string
): string => {
  let prompt = '';

  if (context) {
    prompt += `## Previous Context\n${context}\n\n`;
  }

  prompt += `## Glossary (USE THESE TRANSLATIONS)\n${glossary}\n\n`;

  if (styleGuide) {
    prompt += `## Style Guide\n${styleGuide}\n\n`;
  }

  prompt += `## Text to Translate\n\n${sourceText}\n\n`;
  prompt += `Translate the above text following all guidelines. Return the result as a JSON object with the structure specified in the output format section.`;

  return prompt;
};

export const createGlossaryPromptSection = (
  characters: {
    original: string;
    translated: string;
    declensions?: Record<string, string>;
    description?: string;
  }[],
  locations: { original: string; translated: string; description?: string }[],
  terms: { original: string; translated: string; description?: string }[]
): string => {
  let section = '';

  if (characters.length > 0) {
    section += '### Characters\n';
    for (const char of characters) {
      section += `- ${char.original} → ${char.translated}`;
      if (char.declensions) {
        section += ` (род: ${char.declensions.genitive}, дат: ${char.declensions.dative})`;
      }
      if (char.description) {
        section += ` - ${char.description}`;
      }
      section += '\n';
    }
    section += '\n';
  }

  if (locations.length > 0) {
    section += '### Locations\n';
    for (const loc of locations) {
      section += `- ${loc.original} → ${loc.translated}`;
      if (loc.description) {
        section += ` - ${loc.description}`;
      }
      section += '\n';
    }
    section += '\n';
  }

  if (terms.length > 0) {
    section += '### Terms\n';
    for (const term of terms) {
      section += `- ${term.original} → ${term.translated}`;
      if (term.description) {
        section += ` - ${term.description}`;
      }
      section += '\n';
    }
  }

  return section;
};
