import { useState, useMemo } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui';
import type {
  Chapter,
  Project,
  ChapterTranslationOptions,
  TranslationStageKind,
} from '../../types';
import './TranslationPanel.css';

type Scope = 'full' | 'empty' | 'selected';

const STAGE_ORDER: TranslationStageKind[] = ['analysis', 'translation', 'editing'];

interface TranslationPanelProps {
  chapter: Chapter;
  project: Project;
  projectId: string;
  /** Start translation with given options */
  startTranslation: (options: ChapterTranslationOptions) => void;
  translating: boolean;
  /** Estimate tokens for text length and stages (array or 'all') */
  estimate: (textLength: number, stages?: import('../../types').TranslationStages) => number;
  emptyCount: number;
  selectedParagraphIds: string[];
  onSelectAllEmpty: () => void;
  onDeselectAll: () => void;
  onCancelTranslation: () => void;
  onChapterUpdate: (chapter: Chapter) => void;
  /** Mark current content as ready-made translation (one click) */
  onMarkAsTranslated?: () => void;
  markingAsTranslated?: boolean;
}

/** Get text length for scope (for token estimate). */
function getTextLengthForScope(chapter: Chapter, scope: Scope, selectedIds: string[]): number {
  if (scope === 'selected' && selectedIds.length && chapter.paragraphs?.length) {
    const idSet = new Set(selectedIds);
    return chapter.paragraphs
      .filter((p) => idSet.has(p.id))
      .reduce((sum, p) => sum + p.originalText.length, 0);
  }
  if (scope === 'empty' && chapter.paragraphs?.length) {
    const empty = chapter.paragraphs.filter((p) => {
      const t = p.translatedText?.trim() || '';
      if (!t.length) return true;
      if (t.startsWith('❌') || t.startsWith('[ERROR')) return true;
      return false;
    });
    return empty.reduce((sum, p) => sum + p.originalText.length, 0);
  }
  return chapter.originalText?.length ?? 0;
}

export function TranslationPanel({
  chapter,
  projectId,
  startTranslation,
  translating,
  estimate,
  emptyCount,
  selectedParagraphIds,
  onSelectAllEmpty,
  onDeselectAll,
  onCancelTranslation,
  onMarkAsTranslated,
  markingAsTranslated = false,
}: TranslationPanelProps) {
  const { t } = useTranslation();

  const [scope, setScope] = useState<Scope>('full');
  const [selectedStages, setSelectedStages] = useState<TranslationStageKind[]>([
    'analysis',
    'translation',
    'editing',
  ]);

  const textLength = useMemo(
    () => getTextLengthForScope(chapter, scope, selectedParagraphIds),
    [chapter, scope, selectedParagraphIds]
  );
  const estimatedTokens = useMemo(
    () => estimate(textLength, selectedStages),
    [estimate, textLength, selectedStages]
  );

  const toggleStage = (stage: TranslationStageKind) => {
    setSelectedStages((prev) =>
      prev.includes(stage)
        ? prev.filter((s) => s !== stage)
        : [...prev, stage].sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b))
    );
  };

  const buildOptions = (): ChapterTranslationOptions => {
    const opts: ChapterTranslationOptions = { stages: selectedStages };
    if (scope === 'empty') opts.translateOnlyEmpty = true;
    if (scope === 'selected' && selectedParagraphIds.length)
      opts.paragraphIds = selectedParagraphIds;
    return opts;
  };

  const handleStart = () => {
    startTranslation(buildOptions());
  };

  return (
    <div class="translation-panel">
      <div class="translation-panel-section">
        <div class="translation-panel-label">{t('translationPanel.scope', 'Объём')}</div>
        <div class="translation-panel-scope">
          <label class="translation-panel-radio">
            <input
              type="radio"
              name="scope"
              checked={scope === 'full'}
              onChange={() => setScope('full')}
              disabled={translating}
            />
            <span>{t('translationPanel.scopeFull', 'Вся глава')}</span>
          </label>
          <label class="translation-panel-radio">
            <input
              type="radio"
              name="scope"
              checked={scope === 'empty'}
              onChange={() => setScope('empty')}
              disabled={translating || emptyCount === 0}
            />
            <span>
              {t('translationPanel.scopeEmpty', { count: emptyCount }, `Пустые (${emptyCount})`)}
            </span>
          </label>
          <label class="translation-panel-radio">
            <input
              type="radio"
              name="scope"
              checked={scope === 'selected'}
              onChange={() => setScope('selected')}
              disabled={translating}
            />
            <span>
              {t(
                'translationPanel.scopeSelected',
                { count: selectedParagraphIds.length },
                `Выбранные (${selectedParagraphIds.length})`
              )}
            </span>
          </label>
        </div>
        <div class="translation-panel-actions-inline">
          <button
            type="button"
            class="translation-panel-link"
            onClick={onSelectAllEmpty}
            disabled={translating || emptyCount === 0}
          >
            {t('chapter.selectAll')}
          </button>
          <span class="translation-panel-sep">|</span>
          <button
            type="button"
            class="translation-panel-link"
            onClick={onDeselectAll}
            disabled={translating}
          >
            {t('chapter.deselectAll')}
          </button>
        </div>
      </div>

      <div class="translation-panel-section">
        <div class="translation-panel-label">{t('translationPanel.stages', 'Стадии')}</div>
        <div class="translation-panel-stages">
          {STAGE_ORDER.map((stage) => {
            const checked = selectedStages.includes(stage);
            const label =
              stage === 'analysis'
                ? t('projectInfo.stageAnalysis', 'Анализ')
                : stage === 'translation'
                  ? t('projectInfo.stageTranslation', 'Перевод')
                  : t('projectInfo.stageEditing', 'Редактура');
            const icon = stage === 'analysis' ? '🔍' : stage === 'translation' ? '🔮' : '✨';
            const title =
              stage === 'analysis'
                ? t('translationPanel.stageAnalysisHint', 'Анализ, обновление глоссария')
                : stage === 'translation'
                  ? t('translationPanel.stageTranslationHint', 'Перевод')
                  : t('translationPanel.stageEditingHint', 'Редактура текущего перевода');
            return (
              <label
                key={stage}
                class={`translation-panel-stage-btn ${checked ? 'active' : ''}`}
                title={title}
                style={{ margin: 0, cursor: translating ? 'not-allowed' : 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={translating}
                  onChange={() => toggleStage(stage)}
                  style={{ marginRight: '0.35rem', accentColor: 'var(--accent)' }}
                />
                {icon} {label}
              </label>
            );
          })}
        </div>
        <span class="translation-panel-hint">
          {t('translationPanel.stagesMultiHint', 'Можно выбрать несколько стадий')}
        </span>
      </div>

      <div class="translation-panel-section translation-panel-estimate">
        {estimatedTokens > 0 && (
          <span class="translation-panel-tokens">
            {t(
              'translationPanel.estimatedTokens',
              { tokens: estimatedTokens.toLocaleString() },
              `~${estimatedTokens.toLocaleString()} токенов`
            )}
          </span>
        )}
      </div>

      <div class="translation-panel-section translation-panel-buttons">
        {translating ? (
          <Button variant="secondary" size="sm" onClick={onCancelTranslation}>
            ⏹ {t('chapter.cancelTranslate')}
          </Button>
        ) : (
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={handleStart}
              disabled={
                selectedStages.length === 0 ||
                (scope === 'empty' && emptyCount === 0) ||
                (scope === 'selected' && selectedParagraphIds.length === 0) ||
                chapter.status === 'translating'
              }
            >
              🔮 {t('translationPanel.start', 'Запустить')}
            </Button>
            {onMarkAsTranslated &&
              chapter.paragraphs &&
              chapter.paragraphs.length > 0 &&
              (chapter.status === 'pending' ||
                chapter.status === 'analyzed' ||
                chapter.status === 'error') && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onMarkAsTranslated}
                  disabled={translating || markingAsTranslated}
                  title={t('markAsTranslated.title', 'Пометить как переведённую')}
                >
                  {markingAsTranslated ? <span class="spinner" /> : '✅'}{' '}
                  {t('markAsTranslated.button', 'Пометить как переведённую')}
                </Button>
              )}
          </>
        )}
      </div>
    </div>
  );
}
