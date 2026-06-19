/**
 * Few-shot BAD/GOOD translation examples for mini models (ru/be targets).
 */

import type { Language } from '../../types/common.js';
import { resolveGenderAgreementTarget } from './gender-agreement-target.js';

export const TRANSLATION_EXAMPLES_RU = `
### Translation Examples (learn from these)

**Example 1: Gender agreement (ambiguous "they")**
*Glossary*: Elara [f], Kael [m]
*Original*: Elara watched as Kael read the ancient scroll. They sighed heavily.
*BAD*: Элара смотрела, как Каэль читает древний свиток. Они тяжело вздохнули.
*GOOD*: Элара смотрела, как Каэль читает древний свиток. Она тяжело вздохнула.

**Example 2: Glossary term (use exact form)**
*Glossary*: Shadow Step → Теневой шаг
*Original*: He used Shadow Step to escape.
*BAD*: Он использовал теневой прыжок, чтобы сбежать.
*GOOD*: Он использовал Теневой шаг, чтобы сбежать.
`;

export const TRANSLATION_EXAMPLES_BE = `
### Translation Examples (learn from these)

**Example 1: Gender agreement (ambiguous "they")**
*Glossary*: Elara [f], Kael [m]
*Original*: Elara watched as Kael read the ancient scroll. They sighed heavily.
*BAD*: Элара назірала, як Каэль чытае старажытны світак. Яны цяжка ўздыхнулі.
*GOOD*: Элара назірала, як Каэль чытае старажытны світак. Яна цяжка ўздыхнула.

**Example 2: Glossary term (use exact form)**
*Glossary*: Shadow Step → Ценевы крок
*Original*: He used Shadow Step to escape.
*BAD*: Ён выкарыстаў ценевы скок, каб уцякаць.
*GOOD*: Ён выкарыстаў Ценевы крок, каб уцякаць.
`;

export function getTranslationExamplesFragment(targetLanguage?: Language): string {
  const target = resolveGenderAgreementTarget(targetLanguage);
  if (target === 'be') return TRANSLATION_EXAMPLES_BE;
  if (target === 'ru') return TRANSLATION_EXAMPLES_RU;
  return '';
}

export function appendTranslationExamples(systemPrompt: string, targetLanguage?: Language): string {
  const fragment = getTranslationExamplesFragment(targetLanguage);
  if (!fragment.trim()) return systemPrompt;
  return systemPrompt.trimEnd() + '\n' + fragment;
}
