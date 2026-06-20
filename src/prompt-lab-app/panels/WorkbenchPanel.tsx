import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
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
import { TranslateExecutionPreviewCard } from '../components/TranslateExecutionPreview';
import { TranslateRunSummary } from '../components/TranslateRunSummary';
import { EditExecutionPreviewCard } from '../components/EditExecutionPreview';
import { EditRunSummary } from '../components/EditRunSummary';
import { PlCollapsible } from '../components/PlCollapsible';
import { PlSelect } from '../components/PlSelect';
import { PromptEditorModal } from '../components/PromptEditorModal';
import { PlDiffView } from '../components/PlDiffView';
import { PromptPreviewCard, isTextModified } from '../components/PromptPreviewCard';
import { PlParagraphPreview } from '../components/PlParagraphPreview';
import { SaveTextModal } from '../components/SaveTextModal';
import {
  LANGUAGE_LABELS,
  STAGE_DESCRIPTIONS,
  TARGET_LANGUAGES,
  coerceSourceForTarget,
  sourcesForTarget,
} from '../constants/languages';
import {
  getModelCapabilities,
  modelUsesDefaultTemperature,
  modelsForPromptLabStage,
} from '../../shared/llmModels.js';
import {
  defaultPresetForModel,
  inferPresetFromLegacyParams,
  TRANSLATE_QUALITY_PRESETS,
  type TranslateQualityPreset,
} from '../../shared/translate-quality-presets.js';
import {
  defaultEditPresetForModel,
  inferEditPresetFromLegacyParams,
  EDIT_QUALITY_PRESETS,
  resolvePresetToEditOptions,
  type EditQualityPreset,
} from '../../shared/edit-quality-presets.js';
import { EDIT_FOCUS_LABELS, EDIT_STYLE_LABELS } from '../../shared/editing-labels.js';
import { buildTranslateExecutionPreview } from '@engine/translate-execution-preview.js';
import { buildEditExecutionPreview } from '@engine/edit-execution-preview.js';
import { normalizeLabSourceText, prepareTranslateSourceText } from '@engine/utils/para-markers.js';
import { formatScraperChapterSaveTitle, readScraperChapterFile } from '@shared/scraperChapter.js';
import { TRANSLATION_CHUNK_PRESETS } from '../../shared/translationChunkPresets.js';
import {
  buildStageDraftKey,
  defaultTemperatureForStage,
  type StageDraft,
} from '../utils/stageDraft';

const LAB_CHUNK_OVERRIDE_PRESETS = TRANSLATION_CHUNK_PRESETS.filter((p) => p.value <= 2000);

function resolveInitialTranslatePreset(load?: WorkbenchLoadState | null): TranslateQualityPreset {
  if (
    load?.translateQualityPreset === 'fast' ||
    load?.translateQualityPreset === 'standard' ||
    load?.translateQualityPreset === 'enhanced'
  ) {
    return load.translateQualityPreset;
  }
  if (
    load?.enableTranslateCoT ||
    load?.miniModelTranslationProfile ||
    load?.enableTranslateFewShot
  ) {
    return inferPresetFromLegacyParams({
      enableTranslateCoT: load.enableTranslateCoT,
      enableTranslateFewShot: load.enableTranslateFewShot,
      miniModelTranslationProfile: load.miniModelTranslationProfile,
      translateLeadingContextParagraphs: load.translateLeadingContextParagraphs,
    });
  }
  return defaultPresetForModel(load?.model ?? 'gpt-4.1-mini');
}

function resolveInitialEditPreset(load?: WorkbenchLoadState | null): EditQualityPreset {
  if (
    load?.editQualityPreset === 'fast' ||
    load?.editQualityPreset === 'standard' ||
    load?.editQualityPreset === 'enhanced'
  ) {
    return load.editQualityPreset;
  }
  if (load?.preset || load?.focus) {
    return inferEditPresetFromLegacyParams({ preset: load.preset, focus: load.focus });
  }
  return defaultEditPresetForModel(load?.model ?? 'gpt-4.1-mini');
}

const STAGES: LabStage[] = ['analyze', 'translate', 'edit'];
const PRESETS: EditingPreset[] = ['default', 'literary', 'minimal', 'ai_revivification'];
const FOCUSES: EditingFocus[] = ['fix_only', 'polish', 'elevate'];

export interface WorkbenchRunControl {
  running: boolean;
  run: () => void;
}

interface WorkbenchProps {
  meta: LabMeta | null;
  initialLoad?: WorkbenchLoadState | null;
  onRunSaved?: () => void;
  onRunControl?: (control: WorkbenchRunControl | null) => void;
}

export function WorkbenchPanel({ meta, initialLoad, onRunSaved, onRunControl }: WorkbenchProps) {
  const [stage, setStage] = useState<LabStage>(initialLoad?.stage ?? 'translate');
  const [sourceLanguage, setSourceLanguage] = useState<LabLanguage>(
    initialLoad?.sourceLanguage ?? 'en'
  );
  const [targetLanguage, setTargetLanguage] = useState<LabLanguage>(
    initialLoad?.targetLanguage ?? 'ru'
  );
  const initialEditPreset = resolveInitialEditPreset(initialLoad);
  const initialEditOpts = resolvePresetToEditOptions(initialEditPreset);
  const [preset, setPreset] = useState<EditingPreset>(
    initialLoad?.preset ?? initialEditOpts.editingStylePreset
  );
  const [focus, setFocus] = useState<EditingFocus>(
    initialLoad?.focus ?? initialEditOpts.editingFocus
  );
  const [promptVersion, setPromptVersion] = useState<string>(initialLoad?.promptId ?? 'current');
  const [savedPrompts, setSavedPrompts] = useState<LabPrompt[]>([]);

  const [sourceText, setSourceText] = useState(initialLoad?.sourceText ?? '');
  const [translatedText, setTranslatedText] = useState(initialLoad?.translatedText ?? '');
  const [debouncedSourceText, setDebouncedSourceText] = useState(sourceText);
  const [debouncedTranslatedText, setDebouncedTranslatedText] = useState(translatedText);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSourceText(sourceText), 300);
    return () => clearTimeout(t);
  }, [sourceText]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTranslatedText(translatedText), 300);
    return () => clearTimeout(t);
  }, [translatedText]);

  const [glossary, setGlossary] = useState<GlossarySnapshotEntry[]>(
    initialLoad?.glossarySnapshot ?? []
  );
  const [customInstructions, setCustomInstructions] = useState(
    initialLoad?.customInstructions ?? ''
  );
  const [model, setModel] = useState(initialLoad?.model ?? '');
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high' | ''>(
    initialLoad?.reasoningEffort ?? ''
  );
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
  const [translateQualityPreset, setTranslateQualityPreset] = useState<TranslateQualityPreset>(
    resolveInitialTranslatePreset(initialLoad)
  );
  const [editQualityPreset, setEditQualityPreset] = useState<EditQualityPreset>(
    resolveInitialEditPreset(initialLoad)
  );
  const [chunkSize, setChunkSize] = useState<string>(initialLoad?.chunkSize?.toString() ?? '');
  const [enableStructuredCoT, setEnableStructuredCoT] = useState(
    initialLoad?.enableTranslateStructuredCoT ?? false
  );
  const [forceChunked, setForceChunked] = useState(initialLoad?.forceChunked ?? false);
  const [runLabel, setRunLabel] = useState(initialLoad?.runLabel ?? '');
  const [editorOpen, setEditorOpen] = useState(false);
  const [saveTextOpen, setSaveTextOpen] = useState(false);
  const [saveTextDefaultTitle, setSaveTextDefaultTitle] = useState<string | undefined>();
  const [showDiffInline, setShowDiffInline] = useState(false);

  const dirtyRef = useRef(false);
  const draftsRef = useRef<Map<string, StageDraft>>(new Map());
  const skipBaselineApplyRef = useRef(false);

  const defaultModel = meta?.defaultModel ?? 'gpt-4.1-mini';
  const effectiveModel = model || defaultModel;
  const tempDisabled = modelUsesDefaultTemperature(effectiveModel);
  const stageModels = modelsForPromptLabStage(stage);
  const effectiveModelCaps =
    meta?.modelCapabilities?.find((m) => m.value === effectiveModel) ??
    getModelCapabilities(effectiveModel);

  const translateExecutionPreview = useMemo(() => {
    if (stage !== 'translate') return null;
    const raw = debouncedSourceText.trim();
    const text = raw ? prepareTranslateSourceText(debouncedSourceText) : debouncedSourceText;
    return buildTranslateExecutionPreview({
      preset: translateQualityPreset,
      modelId: effectiveModel,
      sourceText: text,
      targetLanguage,
      includeGlossary,
      chunkSizeOverride: chunkSize ? parseInt(chunkSize, 10) : undefined,
      forceChunked,
      enableTranslateStructuredCoT: enableStructuredCoT,
    });
  }, [
    stage,
    debouncedSourceText,
    translateQualityPreset,
    effectiveModel,
    targetLanguage,
    includeGlossary,
    chunkSize,
    forceChunked,
    enableStructuredCoT,
  ]);

  const editExecutionPreview = useMemo(() => {
    if (stage !== 'edit') return null;
    return buildEditExecutionPreview({
      preset: editQualityPreset,
      modelId: effectiveModel,
      translatedText: debouncedTranslatedText,
      includeGlossary,
      chunkSizeOverride: chunkSize ? parseInt(chunkSize, 10) : undefined,
      forceChunked,
      stylePresetOverride: preset,
      focusOverride: focus,
    });
  }, [
    stage,
    debouncedTranslatedText,
    editQualityPreset,
    effectiveModel,
    includeGlossary,
    chunkSize,
    forceChunked,
    preset,
    focus,
  ]);

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
    if (!initialLoad) return;
    if (initialLoad.systemPrompt) {
      setSystemPrompt(initialLoad.systemPrompt);
      dirtyRef.current = true;
    }
    if (initialLoad.userPromptOverride) {
      setUserPromptOverride(initialLoad.userPromptOverride);
      setUseUserOverride(true);
    }
    if (initialLoad.model) setModel(initialLoad.model);
    if (initialLoad.temperature != null) setTemperature(String(initialLoad.temperature));
    if (initialLoad.glossarySnapshot != null) {
      setGlossary(initialLoad.glossarySnapshot);
    }
    if (initialLoad.customInstructions != null) {
      setCustomInstructions(initialLoad.customInstructions);
    }
    if (initialLoad.chapterNumber != null) {
      setChapterNumber(String(initialLoad.chapterNumber));
    }
    if (initialLoad.includeGlossary != null) {
      setIncludeGlossary(initialLoad.includeGlossary);
    }
    if (initialLoad.chunkSize != null) {
      setChunkSize(String(initialLoad.chunkSize));
    }
    if (
      initialLoad.translateQualityPreset === 'fast' ||
      initialLoad.translateQualityPreset === 'standard' ||
      initialLoad.translateQualityPreset === 'enhanced'
    ) {
      setTranslateQualityPreset(initialLoad.translateQualityPreset);
    } else if (
      initialLoad.enableTranslateCoT ||
      initialLoad.miniModelTranslationProfile ||
      initialLoad.enableTranslateFewShot
    ) {
      setTranslateQualityPreset(
        inferPresetFromLegacyParams({
          enableTranslateCoT: initialLoad.enableTranslateCoT,
          enableTranslateFewShot: initialLoad.enableTranslateFewShot,
          miniModelTranslationProfile: initialLoad.miniModelTranslationProfile,
          translateLeadingContextParagraphs: initialLoad.translateLeadingContextParagraphs,
        })
      );
    }
    if (
      initialLoad.editQualityPreset === 'fast' ||
      initialLoad.editQualityPreset === 'standard' ||
      initialLoad.editQualityPreset === 'enhanced'
    ) {
      setEditQualityPreset(initialLoad.editQualityPreset);
    } else if (initialLoad.preset || initialLoad.focus) {
      setEditQualityPreset(
        inferEditPresetFromLegacyParams({
          preset: initialLoad.preset,
          focus: initialLoad.focus,
        })
      );
    }
    if (initialLoad.enableTranslateStructuredCoT != null) {
      setEnableStructuredCoT(initialLoad.enableTranslateStructuredCoT);
    }
    if (initialLoad.forceChunked != null) {
      setForceChunked(initialLoad.forceChunked);
    }
    if (initialLoad.runLabel != null) {
      setRunLabel(initialLoad.runLabel);
    }
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

  const handleEditQualityPresetChange = (next: EditQualityPreset) => {
    setEditQualityPreset(next);
    const opts = resolvePresetToEditOptions(next);
    setPreset(opts.editingStylePreset);
    setFocus(opts.editingFocus);
  };

  const handleUseInEdit = () => {
    if (!result?.text?.trim()) return;
    setStage('edit');
    setTranslatedText(normalizeLabSourceText(result.text));
  };

  const handleRun = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      const effectiveSourceText =
        stage === 'translate' && sourceText.trim()
          ? prepareTranslateSourceText(sourceText)
          : sourceText;
      if (stage === 'translate' && sourceText.trim() && effectiveSourceText !== sourceText) {
        setSourceText(effectiveSourceText);
      }
      const output = await runStage({
        stage,
        sourceLanguage,
        targetLanguage,
        sourceText: effectiveSourceText,
        translatedText: stage === 'edit' ? translatedText : undefined,
        glossarySnapshot: glossary.length ? glossary : undefined,
        chapterNumber: parseInt(chapterNumber, 10) || 1,
        includeGlossary,
        customInstructions: customInstructions || undefined,
        preset: stage === 'edit' ? preset : undefined,
        focus: stage === 'edit' ? focus : undefined,
        model: model || undefined,
        temperature: parseFloat(temperature) || undefined,
        reasoningEffort: effectiveModelCaps.supportsReasoningEffort
          ? reasoningEffort || 'low'
          : undefined,
        systemPromptOverride: systemPrompt,
        userPromptOverride: useUserOverride ? userPromptOverride : undefined,
        saveRun,
        runLabel: runLabel.trim() || undefined,
        promptId: promptVersion !== 'current' ? promptVersion : null,
        ...(stage === 'translate'
          ? {
              translateQualityPreset,
              chunkSize: chunkSize ? parseInt(chunkSize, 10) : undefined,
              enableTranslateStructuredCoT: enableStructuredCoT || undefined,
              forceChunked: forceChunked || undefined,
            }
          : {}),
        ...(stage === 'edit'
          ? {
              editQualityPreset,
              preset,
              focus,
              chunkSize: chunkSize ? parseInt(chunkSize, 10) : undefined,
              forceChunked: forceChunked || undefined,
            }
          : {}),
      });
      setResult(output);
      dirtyRef.current = false;
      onRunSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed');
    } finally {
      setRunning(false);
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
    model,
    temperature,
    reasoningEffort,
    effectiveModelCaps.supportsReasoningEffort,
    systemPrompt,
    useUserOverride,
    userPromptOverride,
    saveRun,
    runLabel,
    promptVersion,
    chunkSize,
    translateQualityPreset,
    editQualityPreset,
    enableStructuredCoT,
    forceChunked,
    running,
    onRunSaved,
  ]);

  const handleRunRef = useRef(handleRun);
  useEffect(() => {
    handleRunRef.current = handleRun;
  }, [handleRun]);

  useEffect(() => {
    if (!onRunControl) return;
    onRunControl({
      running,
      run: () => {
        void handleRunRef.current();
      },
    });
  }, [running, onRunControl]);

  useEffect(() => {
    return () => onRunControl?.(null);
  }, [onRunControl]);

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
    const normalizedSource = normalizeLabSourceText(sourceText);
    const normalizedTranslated = translatedText.trim()
      ? normalizeLabSourceText(translatedText)
      : undefined;
    setSourceText(normalizedSource);
    if (normalizedTranslated !== undefined) {
      setTranslatedText(normalizedTranslated);
    }
    await saveText({
      title,
      sourceLanguage,
      targetLanguage,
      content: normalizedSource,
      translatedText: normalizedTranslated,
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

  const handleScraperChapterImport = async (file: File) => {
    try {
      const chapter = await readScraperChapterFile(file);
      setSourceText(normalizeLabSourceText(chapter.content));
      setChapterNumber(String(chapter.number));
      setSaveTextDefaultTitle(formatScraperChapterSaveTitle(chapter));
      setError(null);
      setSaveTextOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scraper chapter import failed');
    }
  };

  const handleCloseSaveTextModal = () => {
    setSaveTextOpen(false);
    setSaveTextDefaultTitle(undefined);
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
              onChange={(v) => {
                const next = v === defaultModel ? '' : v;
                setModel(next);
                if (stage === 'translate') {
                  setTranslateQualityPreset(defaultPresetForModel(next || defaultModel));
                } else if (stage === 'edit') {
                  const nextPreset = defaultEditPresetForModel(next || defaultModel);
                  setEditQualityPreset(nextPreset);
                  const opts = resolvePresetToEditOptions(nextPreset);
                  setPreset(opts.editingStylePreset);
                  setFocus(opts.editingFocus);
                }
              }}
            />
            <p class="pl-model-default">Server default: {defaultModel}</p>

            {stage === 'translate' ? (
              <>
                <PlSelect
                  label="Translation quality"
                  value={translateQualityPreset}
                  options={TRANSLATE_QUALITY_PRESETS.map((p) => ({
                    value: p.value,
                    label: `${p.label} — ${p.description}`,
                  }))}
                  onChange={(v) => setTranslateQualityPreset(v as TranslateQualityPreset)}
                />
                <TranslateExecutionPreviewCard preview={translateExecutionPreview} />
              </>
            ) : null}

            {stage === 'edit' ? (
              <>
                <PlSelect
                  label="Editing quality"
                  value={editQualityPreset}
                  options={EDIT_QUALITY_PRESETS.map((p) => ({
                    value: p.value,
                    label: `${p.label} — ${p.description}`,
                  }))}
                  onChange={(v) => handleEditQualityPresetChange(v as EditQualityPreset)}
                />
                <PlSelect
                  label="Editing style"
                  value={preset}
                  options={PRESETS.map((p) => ({ value: p, label: EDIT_STYLE_LABELS[p] }))}
                  onChange={(v) => handlePresetChange(v as EditingPreset)}
                />
                <PlSelect
                  label="Editing focus"
                  value={focus}
                  options={FOCUSES.map((f) => ({ value: f, label: EDIT_FOCUS_LABELS[f] }))}
                  onChange={(v) => handleFocusChange(v as EditingFocus)}
                />
                <EditExecutionPreviewCard preview={editExecutionPreview} />
              </>
            ) : null}

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

            {stage === 'analyze' && effectiveModelCaps.supportsReasoningEffort ? (
              <PlSelect
                label="Reasoning effort"
                value={reasoningEffort || 'low'}
                options={[
                  { value: 'low', label: 'low (default)' },
                  { value: 'medium', label: 'medium' },
                  { value: 'high', label: 'high' },
                ]}
                onChange={(v) => setReasoningEffort(v as 'low' | 'medium' | 'high')}
                hint="Only sent for reasoning models (gpt-5*, o-series)."
              />
            ) : null}

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
                <PlCollapsible title="Translate debug overrides">
                  {translateExecutionPreview?.chunkingMode === 'chunked' ? (
                    <PlSelect
                      label="Chunk size override (tokens)"
                      value={chunkSize || 'auto'}
                      options={[
                        { value: 'auto', label: 'Auto (1200 for mini models)' },
                        ...LAB_CHUNK_OVERRIDE_PRESETS.map((p) => ({
                          value: String(p.value),
                          label: p.label,
                        })),
                      ]}
                      onChange={(v) => setChunkSize(v === 'auto' ? '' : v)}
                    />
                  ) : null}
                  {effectiveModelCaps.supportsReasoningEffort ? (
                    <PlSelect
                      label="Reasoning effort"
                      value={reasoningEffort || 'low'}
                      options={[
                        { value: 'low', label: 'low (default)' },
                        { value: 'medium', label: 'medium' },
                        { value: 'high', label: 'high' },
                      ]}
                      onChange={(v) => setReasoningEffort(v as 'low' | 'medium' | 'high')}
                    />
                  ) : null}
                  {translateQualityPreset === 'enhanced' && effectiveModelCaps.isReasoningModel ? (
                    <label class="pl-checkbox-label">
                      <input
                        type="checkbox"
                        checked={enableStructuredCoT}
                        onChange={(e) => setEnableStructuredCoT(e.currentTarget.checked)}
                      />
                      Structured CoT (json_schema)
                    </label>
                  ) : null}
                  <label class="pl-checkbox-label">
                    <input
                      type="checkbox"
                      checked={forceChunked}
                      onChange={(e) => setForceChunked(e.currentTarget.checked)}
                    />
                    Force chunked (A/B vs single-shot)
                  </label>
                </PlCollapsible>
              ) : null}
              {stage === 'edit' ? (
                <PlCollapsible title="Edit debug overrides">
                  {editExecutionPreview?.chunkingMode === 'chunked' ? (
                    <PlSelect
                      label="Chunk size override (tokens)"
                      value={chunkSize || 'auto'}
                      options={[
                        { value: 'auto', label: 'Auto (from preset)' },
                        ...LAB_CHUNK_OVERRIDE_PRESETS.map((p) => ({
                          value: String(p.value),
                          label: p.label,
                        })),
                      ]}
                      onChange={(v) => setChunkSize(v === 'auto' ? '' : v)}
                    />
                  ) : null}
                  {effectiveModelCaps.supportsReasoningEffort ? (
                    <PlSelect
                      label="Reasoning effort"
                      value={reasoningEffort || 'low'}
                      options={[
                        { value: 'low', label: 'low (default)' },
                        { value: 'medium', label: 'medium' },
                        { value: 'high', label: 'high' },
                      ]}
                      onChange={(v) => setReasoningEffort(v as 'low' | 'medium' | 'high')}
                    />
                  ) : null}
                  <label class="pl-field">
                    <span class="pl-label">Original reference (optional)</span>
                    <span class="pl-hint">Not sent to editor prompt — for save/replay only.</span>
                    <textarea
                      class="pl-textarea pl-textarea--compact"
                      value={sourceText}
                      onInput={(e) => setSourceText(e.currentTarget.value)}
                      placeholder="Source chapter (optional)…"
                    />
                  </label>
                  <label class="pl-checkbox-label">
                    <input
                      type="checkbox"
                      checked={forceChunked}
                      onChange={(e) => setForceChunked(e.currentTarget.checked)}
                    />
                    Force chunked (A/B vs single-shot)
                  </label>
                </PlCollapsible>
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
            {stage === 'edit' ? (
              <>
                <label class="pl-field">
                  <span class="pl-label">Draft to polish</span>
                  <textarea
                    class="pl-textarea pl-textarea--compact"
                    value={translatedText}
                    onInput={(e) => setTranslatedText(e.currentTarget.value)}
                    placeholder="Paste translated chapter or paragraph…"
                  />
                </label>
                <PlParagraphPreview text={debouncedTranslatedText} label="Draft paragraphs" />
              </>
            ) : (
              <>
                <label class="pl-field">
                  <span class="pl-label">Source text</span>
                  <textarea
                    class="pl-textarea pl-textarea--compact"
                    value={sourceText}
                    onInput={(e) => setSourceText(e.currentTarget.value)}
                    placeholder="Paste chapter or paragraph…"
                  />
                </label>
                <PlParagraphPreview text={debouncedSourceText} label="Source paragraphs" />
                {stage === 'translate' ? (
                  <p class="pl-muted">
                    Paragraph markers are applied automatically for translate (same as Reader).
                  </p>
                ) : null}
              </>
            )}
            <div class="pl-row">
              <button
                type="button"
                class="pl-btn secondary"
                onClick={() => {
                  setSaveTextDefaultTitle(undefined);
                  setSaveTextOpen(true);
                }}
              >
                Save text
              </button>
              {stage !== 'edit' ? (
                <label class="pl-btn secondary">
                  Import scraper chapter
                  <input
                    type="file"
                    accept=".json,application/json"
                    hidden
                    onChange={(e) => {
                      const f = e.currentTarget.files?.[0];
                      e.currentTarget.value = '';
                      if (f) void handleScraperChapterImport(f);
                    }}
                  />
                </label>
              ) : null}
            </div>
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
                {result.apiRequestParams ? (
                  <pre class="pl-api-params">
                    {JSON.stringify(result.apiRequestParams, null, 2)}
                  </pre>
                ) : null}
                {result.stage === 'translate' ? (
                  <TranslateRunSummary
                    result={result}
                    sourceLength={
                      stage === 'translate' && sourceText.trim()
                        ? prepareTranslateSourceText(sourceText).length
                        : sourceText.length
                    }
                  />
                ) : null}
                {result.stage === 'edit' ? (
                  <EditRunSummary result={result} draftLength={translatedText.length} />
                ) : null}
                {result.stage === 'translate' && result.success && result.text ? (
                  <button type="button" class="pl-btn secondary" onClick={handleUseInEdit}>
                    Use in Edit
                  </button>
                ) : null}
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
        defaultTitle={saveTextDefaultTitle}
        onClose={handleCloseSaveTextModal}
        onSave={handleSaveText}
      />
    </>
  );
}
