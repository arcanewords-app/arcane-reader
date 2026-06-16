import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type {
  EditingFocus,
  EditingPreset,
  GlossarySnapshotEntry,
  LabLanguage,
  LabMeta,
  LabPrompt,
  LabRunOutput,
  LabStage,
  WorkbenchLoadState,
} from '../api/client';
import {
  fetchCurrentPrompt,
  fetchPrompts,
  importGlossaryFile,
  previewUserPrompt,
  runStage,
  savePrompt,
  saveText,
} from '../api/client';
import { AnalysisResultView } from '../components/AnalysisResultView';
import { PlCollapsible } from '../components/PlCollapsible';
import { PlSelect } from '../components/PlSelect';
import { PromptEditorModal } from '../components/PromptEditorModal';
import { PlDiffView } from '../components/PlDiffView';
import { PromptPreviewCard, isTextModified } from '../components/PromptPreviewCard';
import { SaveTextModal } from '../components/SaveTextModal';
import {
  LANGUAGE_LABELS,
  STAGE_DESCRIPTIONS,
  TARGET_LANGUAGES,
  coerceSourceForTarget,
  sourcesForTarget,
} from '../constants/languages';
import { modelUsesDefaultTemperature, modelsForStage } from '../../shared/llmModels.js';
import {
  buildStageDraftKey,
  defaultTemperatureForStage,
  type StageDraft,
} from '../utils/stageDraft';

const STAGES: LabStage[] = ['analyze', 'translate', 'edit'];
const PRESETS: EditingPreset[] = ['default', 'literary', 'minimal', 'ai_revivification'];
const FOCUSES: EditingFocus[] = ['fix_problems', 'style_only', 'both'];

interface WorkbenchProps {
  meta: LabMeta | null;
  initialLoad?: WorkbenchLoadState | null;
  onRunSaved?: () => void;
}

export function WorkbenchPanel({ meta, initialLoad, onRunSaved }: WorkbenchProps) {
  const [stage, setStage] = useState<LabStage>(initialLoad?.stage ?? 'translate');
  const [sourceLanguage, setSourceLanguage] = useState<LabLanguage>(
    initialLoad?.sourceLanguage ?? 'en'
  );
  const [targetLanguage, setTargetLanguage] = useState<LabLanguage>(
    initialLoad?.targetLanguage ?? 'ru'
  );
  const [preset, setPreset] = useState<EditingPreset>(initialLoad?.preset ?? 'default');
  const [focus, setFocus] = useState<EditingFocus>(initialLoad?.focus ?? 'both');
  const [promptVersion, setPromptVersion] = useState<string>(initialLoad?.promptId ?? 'current');
  const [savedPrompts, setSavedPrompts] = useState<LabPrompt[]>([]);

  const [sourceText, setSourceText] = useState(initialLoad?.sourceText ?? '');
  const [translatedText, setTranslatedText] = useState(initialLoad?.translatedText ?? '');
  const [glossary, setGlossary] = useState<GlossarySnapshotEntry[]>(
    initialLoad?.glossarySnapshot ?? []
  );
  const [customInstructions, setCustomInstructions] = useState(
    initialLoad?.customInstructions ?? ''
  );
  const [model, setModel] = useState(initialLoad?.model ?? '');
  const [temperature, setTemperature] = useState(
    String(initialLoad?.temperature ?? (stage === 'analyze' ? 0.3 : stage === 'edit' ? 0.5 : 0.7))
  );
  const [chapterNumber, setChapterNumber] = useState(String(initialLoad?.chapterNumber ?? 1));
  const [includeGlossary, setIncludeGlossary] = useState(initialLoad?.includeGlossary ?? true);

  const [systemPrompt, setSystemPrompt] = useState(initialLoad?.systemPrompt ?? '');
  const [baselineSystemPrompt, setBaselineSystemPrompt] = useState('');
  const [userPromptOverride, setUserPromptOverride] = useState(
    initialLoad?.userPromptOverride ?? ''
  );
  const [useUserOverride, setUseUserOverride] = useState(initialLoad?.useUserOverride ?? false);
  const [userPreview, setUserPreview] = useState('');
  const [baselineUserPreview, setBaselineUserPreview] = useState('');

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LabRunOutput | null>(null);
  const [saveRun, setSaveRun] = useState(true);
  const [injectMarkers, setInjectMarkers] = useState(true);
  const [runLabel, setRunLabel] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [saveTextOpen, setSaveTextOpen] = useState(false);
  const [showDiffInline, setShowDiffInline] = useState(false);

  const dirtyRef = useRef(false);
  const draftsRef = useRef<Map<string, StageDraft>>(new Map());
  const skipBaselineApplyRef = useRef(false);

  const defaultModel = meta?.defaultModel ?? 'gpt-4.1-mini';
  const effectiveModel = model || defaultModel;
  const tempDisabled = modelUsesDefaultTemperature(effectiveModel);
  const stageModels = modelsForStage(stage);

  const markDirty = () => {
    dirtyRef.current = true;
  };

  const snapshotDraft = useCallback((): StageDraft => {
    return {
      systemPrompt,
      baselineSystemPrompt,
      userPromptOverride,
      useUserOverride,
      userPreview,
      baselineUserPreview,
      promptVersion,
      dirty: dirtyRef.current,
      temperature,
      model,
    };
  }, [
    systemPrompt,
    baselineSystemPrompt,
    userPromptOverride,
    useUserOverride,
    userPreview,
    baselineUserPreview,
    promptVersion,
    temperature,
    model,
  ]);

  const persistDraftFor = useCallback(
    (
      draftStage: LabStage,
      draftSource: LabLanguage,
      draftTarget: LabLanguage,
      draftPreset: EditingPreset,
      draftFocus: EditingFocus
    ) => {
      const key = buildStageDraftKey(draftStage, draftSource, draftTarget, draftPreset, draftFocus);
      draftsRef.current.set(key, snapshotDraft());
    },
    [snapshotDraft]
  );

  const applyDraft = useCallback((draft: StageDraft, opts?: { deferBaselineFetch?: boolean }) => {
    if (opts?.deferBaselineFetch) {
      skipBaselineApplyRef.current = true;
    }
    setSystemPrompt(draft.systemPrompt);
    setBaselineSystemPrompt(draft.baselineSystemPrompt);
    setUserPromptOverride(draft.userPromptOverride);
    setUseUserOverride(draft.useUserOverride);
    setUserPreview(draft.userPreview);
    setBaselineUserPreview(draft.baselineUserPreview);
    setPromptVersion(draft.promptVersion);
    setTemperature(draft.temperature);
    setModel(draft.model);
    dirtyRef.current = draft.dirty;
  }, []);

  const confirmDiscard = (): boolean => {
    if (!dirtyRef.current) return true;
    return window.confirm('You have unsaved prompt edits. Discard changes?');
  };

  const loadBaselinePrompt = useCallback(async () => {
    try {
      const data = await fetchCurrentPrompt({
        stage,
        source: sourceLanguage,
        target: targetLanguage,
        preset: stage === 'edit' ? preset : undefined,
        focus: stage === 'edit' ? focus : undefined,
      });
      setBaselineSystemPrompt(data.systemPrompt);
      if (skipBaselineApplyRef.current) {
        skipBaselineApplyRef.current = false;
        return;
      }
      const key = buildStageDraftKey(stage, sourceLanguage, targetLanguage, preset, focus);
      const cached = draftsRef.current.get(key);
      if (cached) {
        setSystemPrompt(cached.systemPrompt);
        setUserPromptOverride(cached.userPromptOverride);
        setUseUserOverride(cached.useUserOverride);
        setUserPreview(cached.userPreview);
        setBaselineUserPreview(cached.baselineUserPreview);
        setPromptVersion(cached.promptVersion);
        setTemperature(cached.temperature);
        setModel(cached.model);
        dirtyRef.current = cached.dirty;
        return;
      }
      if (promptVersion === 'current' && !dirtyRef.current) {
        setSystemPrompt(data.systemPrompt);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load prompt');
    }
  }, [stage, sourceLanguage, targetLanguage, preset, focus, promptVersion]);

  const loadSavedPrompts = useCallback(async () => {
    const { prompts } = await fetchPrompts({
      stage,
      source: sourceLanguage,
      target: targetLanguage,
    });
    setSavedPrompts(prompts);
  }, [stage, sourceLanguage, targetLanguage]);

  const refreshUserPreview = useCallback(async () => {
    if (useUserOverride) return;
    try {
      const { userPrompt } = await previewUserPrompt({
        stage,
        sourceLanguage,
        targetLanguage,
        sourceText,
        translatedText: stage === 'edit' ? translatedText : undefined,
        glossarySnapshot: glossary.length ? glossary : undefined,
        chapterNumber: parseInt(chapterNumber, 10) || 1,
        includeGlossary,
        customInstructions: customInstructions || undefined,
        preset: stage === 'edit' ? preset : undefined,
        focus: stage === 'edit' ? focus : undefined,
      });
      setUserPreview(userPrompt);
      if (!useUserOverride) {
        setBaselineUserPreview(userPrompt);
      }
    } catch {
      setUserPreview('');
    }
  }, [
    stage,
    sourceLanguage,
    targetLanguage,
    sourceText,
    translatedText,
    glossary,
    chapterNumber,
    includeGlossary,
    customInstructions,
    preset,
    focus,
    useUserOverride,
  ]);

  useEffect(() => {
    void loadBaselinePrompt();
    void loadSavedPrompts();
  }, [loadBaselinePrompt, loadSavedPrompts]);

  useEffect(() => {
    const t = setTimeout(() => void refreshUserPreview(), 400);
    return () => clearTimeout(t);
  }, [refreshUserPreview]);

  useEffect(() => {
    if (promptVersion === 'current') return;
    const p = savedPrompts.find((x) => x.id === promptVersion);
    if (p) {
      setSystemPrompt(p.systemPrompt);
      if (p.userPromptOverride) {
        setUserPromptOverride(p.userPromptOverride);
        setUseUserOverride(true);
      }
      dirtyRef.current = true;
    }
  }, [promptVersion, savedPrompts]);

  useEffect(() => {
    if (initialLoad?.systemPrompt) {
      setSystemPrompt(initialLoad.systemPrompt);
      dirtyRef.current = true;
    }
    if (initialLoad?.userPromptOverride) {
      setUserPromptOverride(initialLoad.userPromptOverride);
      setUseUserOverride(true);
    }
    if (initialLoad?.model) setModel(initialLoad.model);
    if (initialLoad?.temperature != null) setTemperature(String(initialLoad.temperature));
  }, [initialLoad]);

  const navigateWorkbenchContext = useCallback(
    (next: {
      stage?: LabStage;
      sourceLanguage?: LabLanguage;
      targetLanguage?: LabLanguage;
      preset?: EditingPreset;
      focus?: EditingFocus;
    }) => {
      persistDraftFor(stage, sourceLanguage, targetLanguage, preset, focus);

      const nextStage = next.stage ?? stage;
      const nextTarget = next.targetLanguage ?? targetLanguage;
      const nextSource =
        next.sourceLanguage ??
        (next.targetLanguage
          ? coerceSourceForTarget(sourceLanguage, next.targetLanguage)
          : sourceLanguage);
      const nextPreset = next.preset ?? preset;
      const nextFocus = next.focus ?? focus;

      const nextKey = buildStageDraftKey(nextStage, nextSource, nextTarget, nextPreset, nextFocus);
      const cached = draftsRef.current.get(nextKey);

      if (next.stage != null) setStage(next.stage);
      if (next.sourceLanguage != null) setSourceLanguage(next.sourceLanguage);
      if (next.targetLanguage != null) {
        setTargetLanguage(next.targetLanguage);
        if (next.sourceLanguage == null && next.stage == null) {
          setSourceLanguage(coerceSourceForTarget(sourceLanguage, next.targetLanguage));
        }
      }
      if (next.preset != null) setPreset(next.preset);
      if (next.focus != null) setFocus(next.focus);

      if (cached) {
        applyDraft(cached, { deferBaselineFetch: true });
        return;
      }

      setPromptVersion('current');
      dirtyRef.current = false;
      if (next.stage != null) {
        setTemperature(defaultTemperatureForStage(next.stage));
      }
    },
    [stage, sourceLanguage, targetLanguage, preset, focus, persistDraftFor, applyDraft]
  );

  const handleStageChange = (next: LabStage) => {
    if (next === stage) return;
    navigateWorkbenchContext({ stage: next });
  };

  const handleTargetChange = (tgt: LabLanguage) => {
    if (tgt === targetLanguage) return;
    navigateWorkbenchContext({ targetLanguage: tgt });
  };

  const handleSourceChange = (src: LabLanguage) => {
    if (src === sourceLanguage) return;
    navigateWorkbenchContext({ sourceLanguage: src });
  };

  const handlePresetChange = (next: EditingPreset) => {
    if (next === preset) return;
    navigateWorkbenchContext({ preset: next });
  };

  const handleFocusChange = (next: EditingFocus) => {
    if (next === focus) return;
    navigateWorkbenchContext({ focus: next });
  };

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    try {
      const output = await runStage({
        stage,
        sourceLanguage,
        targetLanguage,
        sourceText,
        translatedText: stage === 'edit' ? translatedText : undefined,
        glossarySnapshot: glossary.length ? glossary : undefined,
        chapterNumber: parseInt(chapterNumber, 10) || 1,
        includeGlossary,
        customInstructions: customInstructions || undefined,
        preset: stage === 'edit' ? preset : undefined,
        focus: stage === 'edit' ? focus : undefined,
        model: model || undefined,
        temperature: parseFloat(temperature) || undefined,
        systemPromptOverride: systemPrompt,
        userPromptOverride: useUserOverride ? userPromptOverride : undefined,
        saveRun,
        injectMarkers: stage === 'translate' ? injectMarkers : undefined,
        runLabel: runLabel.trim() || undefined,
        promptId: promptVersion !== 'current' ? promptVersion : null,
      });
      setResult(output);
      dirtyRef.current = false;
      onRunSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed');
    } finally {
      setRunning(false);
    }
  };

  const handleSavePromptVersion = async (name: string) => {
    await savePrompt({
      stage,
      sourceLanguage,
      targetLanguage,
      name,
      systemPrompt,
      userPromptOverride: useUserOverride ? userPromptOverride : null,
      preset: stage === 'edit' ? preset : null,
      focus: stage === 'edit' ? focus : null,
    });
    await loadSavedPrompts();
    dirtyRef.current = false;
  };

  const handleSaveText = async (title: string) => {
    await saveText({
      title,
      sourceLanguage,
      targetLanguage,
      content: sourceText,
      translatedText: translatedText || undefined,
      glossarySnapshot: glossary.length ? glossary : undefined,
      stageHint: stage,
    });
  };

  const handleGlossaryImport = async (file: File) => {
    const parsed = await importGlossaryFile(file);
    if (parsed.errors.length) {
      setError(`Import: ${parsed.errors.length} errors`);
    }
    setGlossary(parsed.entries as GlossarySnapshotEntry[]);
  };

  const handleResetPrompts = () => {
    setSystemPrompt(baselineSystemPrompt);
    setUserPromptOverride(baselineUserPreview);
    setUseUserOverride(false);
    setPromptVersion('current');
    dirtyRef.current = false;
    const key = buildStageDraftKey(stage, sourceLanguage, targetLanguage, preset, focus);
    draftsRef.current.delete(key);
  };

  const systemModified = isTextModified(baselineSystemPrompt, systemPrompt);
  const userModified = useUserOverride && isTextModified(baselineUserPreview, userPromptOverride);
  const activeUserPrompt = useUserOverride ? userPromptOverride : userPreview;

  return (
    <>
      <div class="pl-workbench-grid">
        {/* Configuration column */}
        <div class="pl-workbench-col pl-workbench-col--config">
          <section class="pl-section">
            <h2 class="pl-section-title">Configuration</h2>

            <PlSelect
              label="Stage"
              value={stage}
              options={STAGES.map((s) => ({ value: s, label: s }))}
              onChange={(v) => handleStageChange(v as LabStage)}
            />
            <p class="pl-section-desc">{STAGE_DESCRIPTIONS[stage]}</p>

            {stage === 'edit' ? (
              <>
                <PlSelect
                  label="Target language"
                  value={targetLanguage}
                  hint="Source language does not affect the editor system prompt."
                  options={TARGET_LANGUAGES.map((code) => ({
                    value: code,
                    label: LANGUAGE_LABELS[code],
                  }))}
                  onChange={(v) => handleTargetChange(v as LabLanguage)}
                />
                <PlSelect
                  label="Preset"
                  value={preset}
                  options={PRESETS.map((p) => ({ value: p, label: p }))}
                  onChange={(v) => handlePresetChange(v as EditingPreset)}
                />
                <PlSelect
                  label="Focus"
                  value={focus}
                  options={FOCUSES.map((f) => ({ value: f, label: f }))}
                  onChange={(v) => handleFocusChange(v as EditingFocus)}
                />
              </>
            ) : (
              <div class="pl-lang-pair-row">
                <PlSelect
                  label="Source"
                  value={sourceLanguage}
                  options={sourcesForTarget(targetLanguage).map((code) => ({
                    value: code,
                    label: LANGUAGE_LABELS[code],
                  }))}
                  onChange={(v) => handleSourceChange(v as LabLanguage)}
                />
                <PlSelect
                  label="Target"
                  value={targetLanguage}
                  options={TARGET_LANGUAGES.map((code) => ({
                    value: code,
                    label: LANGUAGE_LABELS[code],
                  }))}
                  onChange={(v) => handleTargetChange(v as LabLanguage)}
                />
              </div>
            )}

            <PlSelect
              label="Model"
              value={model || defaultModel}
              options={[
                ...stageModels.map((m: { value: string; label: string }) => ({
                  value: m.value,
                  label: m.label,
                })),
                ...(model && !stageModels.some((m: { value: string }) => m.value === model)
                  ? [{ value: model, label: `${model} (custom)` }]
                  : []),
              ]}
              onChange={(v) => setModel(v === defaultModel ? '' : v)}
            />
            <p class="pl-model-default">Server default: {defaultModel}</p>

            <label class="pl-field">
              <span class="pl-label">
                Temperature {tempDisabled ? '(fixed for this model)' : ''}
              </span>
              <input
                type="range"
                class="pl-temp-slider"
                min="0"
                max="100"
                disabled={tempDisabled}
                value={Math.round(parseFloat(temperature || '0.7') * 100)}
                onInput={(e) => setTemperature(String(parseInt(e.currentTarget.value, 10) / 100))}
              />
              <span class="pl-hint">{temperature}</span>
            </label>

            <PlSelect
              label="Prompt version"
              value={promptVersion}
              options={[
                { value: 'current', label: 'current (from code)' },
                ...savedPrompts.map((p) => ({ value: p.id, label: p.name })),
              ]}
              onChange={(v) => {
                if (v === promptVersion) return;
                if (!confirmDiscard()) return;
                persistDraftFor(stage, sourceLanguage, targetLanguage, preset, focus);
                setPromptVersion(v);
                dirtyRef.current = false;
                const key = buildStageDraftKey(
                  stage,
                  sourceLanguage,
                  targetLanguage,
                  preset,
                  focus
                );
                draftsRef.current.delete(key);
              }}
            />

            <button
              type="button"
              class="pl-btn pl-btn--block"
              disabled={running}
              onClick={() => void handleRun()}
            >
              {running ? 'Running…' : 'Run stage'}
            </button>

            <PlCollapsible title="Advanced options">
              <label class="pl-field">
                <span class="pl-label">Chapter #</span>
                <input
                  class="pl-input"
                  value={chapterNumber}
                  onInput={(e) => setChapterNumber(e.currentTarget.value)}
                />
              </label>
              <label class="pl-checkbox-label">
                <input
                  type="checkbox"
                  checked={includeGlossary}
                  onChange={(e) => setIncludeGlossary(e.currentTarget.checked)}
                />
                Include glossary
              </label>
              <span class="pl-muted">Glossary entries: {glossary.length}</span>
              <label class="pl-btn secondary">
                Import glossary
                <input
                  type="file"
                  accept=".json,.csv"
                  hidden
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    if (f) void handleGlossaryImport(f);
                  }}
                />
              </label>
              <label class="pl-field">
                <span class="pl-label">Custom instructions</span>
                <textarea
                  class="pl-textarea pl-textarea--compact"
                  value={customInstructions}
                  onInput={(e) => setCustomInstructions(e.currentTarget.value)}
                />
              </label>
              <label class="pl-field">
                <span class="pl-label">Run label (optional suffix)</span>
                <input
                  class="pl-input"
                  type="text"
                  value={runLabel}
                  onInput={(e) => setRunLabel(e.currentTarget.value)}
                  placeholder="e.g. v2, literary-test"
                />
              </label>
              {stage === 'translate' ? (
                <label class="pl-checkbox-label">
                  <input
                    type="checkbox"
                    checked={injectMarkers}
                    onChange={(e) => setInjectMarkers(e.currentTarget.checked)}
                  />
                  Inject paragraph markers (--para:id--)
                </label>
              ) : null}
              <label class="pl-checkbox-label">
                <input
                  type="checkbox"
                  checked={saveRun}
                  onChange={(e) => setSaveRun(e.currentTarget.checked)}
                />
                Save run to history
              </label>
            </PlCollapsible>
          </section>
        </div>

        {/* Prompts column */}
        <div class="pl-workbench-col">
          <section class="pl-section">
            <h2 class="pl-section-title">Prompts</h2>
            <div class="pl-row">
              <button type="button" class="pl-btn secondary" onClick={handleResetPrompts}>
                Reset to current
              </button>
              <button
                type="button"
                class="pl-btn secondary"
                onClick={() => setShowDiffInline((v) => !v)}
              >
                {showDiffInline ? 'Hide diff' : 'Diff baseline'}
              </button>
            </div>

            {showDiffInline ? (
              <div class="pl-prompt-editor-diff">
                <p class="pl-label">System prompt</p>
                <PlDiffView baseline={baselineSystemPrompt} current={systemPrompt} />
              </div>
            ) : (
              <>
                <PromptPreviewCard
                  title="System prompt"
                  preview={systemPrompt}
                  modified={systemModified}
                  onEdit={() => setEditorOpen(true)}
                />
                <PromptPreviewCard
                  title={useUserOverride ? 'User prompt (override)' : 'User prompt (preview)'}
                  preview={activeUserPrompt}
                  modified={userModified}
                  onEdit={() => setEditorOpen(true)}
                />
              </>
            )}
          </section>
        </div>

        {/* Input & Result column */}
        <div class="pl-workbench-col">
          <section class="pl-section">
            <h2 class="pl-section-title">Input</h2>
            <label class="pl-field">
              <span class="pl-label">Source text</span>
              <textarea
                class="pl-textarea pl-textarea--compact"
                value={sourceText}
                onInput={(e) => setSourceText(e.currentTarget.value)}
                placeholder="Paste chapter or paragraph…"
              />
            </label>
            {stage === 'edit' ? (
              <label class="pl-field">
                <span class="pl-label">Translated text (for edit)</span>
                <textarea
                  class="pl-textarea pl-textarea--compact"
                  value={translatedText}
                  onInput={(e) => setTranslatedText(e.currentTarget.value)}
                />
              </label>
            ) : null}
            <button type="button" class="pl-btn secondary" onClick={() => setSaveTextOpen(true)}>
              Save text
            </button>
          </section>

          <section class="pl-section">
            <h2 class="pl-section-title">Result</h2>
            {error ? <p class="pl-error">{error}</p> : null}
            {result ? (
              <>
                <p class={result.success ? 'pl-success' : 'pl-error'}>
                  {result.success ? 'Success' : 'Failed'}
                  {result.error ? `: ${result.error}` : ''}
                </p>
                <div class="pl-run-meta">
                  {result.tokensUsed} tokens · {result.durationMs} ms · model {effectiveModel}
                </div>
                {result.stage === 'analyze' && result.analysis ? (
                  <AnalysisResultView analysis={result.analysis} />
                ) : (
                  <textarea class="pl-textarea" readOnly value={result.text ?? ''} />
                )}
              </>
            ) : (
              <p class="pl-muted">Run a stage to see output here.</p>
            )}
          </section>
        </div>
      </div>

      <PromptEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        systemPrompt={systemPrompt}
        baselineSystemPrompt={baselineSystemPrompt}
        userPrompt={activeUserPrompt}
        baselineUserPrompt={baselineUserPreview}
        useUserOverride={useUserOverride}
        onSystemChange={(v) => {
          setSystemPrompt(v);
          markDirty();
        }}
        onUserChange={(v) => {
          setUserPromptOverride(v);
          markDirty();
        }}
        onUseUserOverrideChange={setUseUserOverride}
        onReset={handleResetPrompts}
        onSaveVersion={handleSavePromptVersion}
      />

      <SaveTextModal
        open={saveTextOpen}
        onClose={() => setSaveTextOpen(false)}
        onSave={handleSaveText}
      />
    </>
  );
}
