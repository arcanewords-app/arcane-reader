/** Human-readable labels for editing style/focus (Lab + summaries). */
import type { EditingFocus, EditingStylePreset } from '../engine/prompts/system/editor.js';

export const EDIT_STYLE_LABELS: Record<EditingStylePreset, string> = {
  default: 'Standard',
  literary: 'Literary',
  minimal: 'Minimal',
  ai_revivification: 'AI translation fix',
};

export const EDIT_FOCUS_LABELS: Record<EditingFocus, string> = {
  fix_only: 'Fix only',
  polish: 'Polish',
  elevate: 'Literary elevation',
};
