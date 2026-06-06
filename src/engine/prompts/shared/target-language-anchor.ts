/**
 * SSOT: explicit source/target language anchors in user prompts (Stage 2 translate, Stage 3 edit).
 */

export function buildTargetLanguageAnchor(sourceLabel: string, targetLabel: string): string {
  return `## Translation direction (mandatory)
- Source language: **${sourceLabel}**
- Target language: **${targetLabel}**
- Output MUST be written entirely in **${targetLabel}**. Do not output ${sourceLabel} prose (except proper nouns/terms as required).
- Do not translate into any other language (e.g. if target is Belarusian, do not use Russian vocabulary where Belarusian forms exist).`;
}

export function buildEditorTargetLanguageAnchor(targetLabel: string): string {
  return `## Output language (mandatory)
- Polish and edit the text in **${targetLabel}** only.
- Do not convert to another language (e.g. if the target is Belarusian, do not replace Belarusian forms with Russian).`;
}
