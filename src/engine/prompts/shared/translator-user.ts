import type { TranslatorUserPromptParams } from '../types.js';

export const TRANSLATOR_JSON_OUTPUT_FORMAT = `## Output Format

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

**Fallback (if markers are not present):**
If the original text does not contain paragraph markers, return a simple JSON:
{
  "paragraphs": [
    {"id": "auto_0", "translated": "Full translation text here..."}
  ]
}

## Special Text Blocks

When text block types are configured in the user prompt section "Text Block Types", wrap special text with markers:
- Format: {{block:type-name}}text{{/block:type-name}}
- Markers can be block-level (wrapping entire paragraphs) or inline (within text)
- ONLY use the types listed in the user prompt section "Text Block Types"
- If no types are configured, do NOT add any markers`;

export function buildTranslatorUserPrompt(params: TranslatorUserPromptParams): string {
  let prompt = '';

  if (params.context) {
    prompt += `## Previous Context\n${params.context}\n\n`;
  }

  if (params.glossary && params.glossary.trim()) {
    prompt += `## Glossary (USE THESE TRANSLATIONS)\n${params.glossary}\n\n`;
  }

  if (params.styleGuide) {
    prompt += `## Style Guide\n${params.styleGuide}\n\n`;
  }

  if (params.textBlockTypes?.length) {
    const enabled = params.textBlockTypes.filter((bt) => bt.enabled);
    if (enabled.length > 0) {
      prompt += `## Text Block Types\n`;
      prompt += `Wrap special text with these markers:\n`;
      for (const bt of enabled) {
        prompt += `- {{block:${bt.id}}} ... {{/block:${bt.id}}} — ${bt.description}\n`;
      }
      prompt += `\nRules:\n`;
      prompt += `- Only use these types, do not invent new ones\n`;
      prompt += `- Inline types can appear inside a sentence\n`;
      prompt += `- Block types wrap entire paragraphs or multi-line content\n\n`;
    }
  }

  if (params.customInstructions?.trim()) {
    prompt += `## Additional Translation Instructions\n${params.customInstructions.trim()}\n\n`;
  }

  prompt += `## Text to Translate\n\n${params.sourceText}\n\n`;
  prompt += `Translate the above text following all guidelines. Return the result as a JSON object with the structure specified in the output format section.`;

  return prompt;
}

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
