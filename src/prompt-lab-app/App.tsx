import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type {
  LabMeta,
  LabPrompt,
  LabRun,
  LabStage,
  LabText,
  WorkbenchLoadState,
} from './api/client.js';
import { fetchMeta } from './api/client.js';
import { normalizeTranslateExecutionMode } from '../shared/translate-execution-modes.js';
import { normalizeEditExecutionMode } from '../shared/edit-execution-modes.js';
import { normalizeLabSourceText, normalizeLabTranslatedText } from '@engine/utils/para-markers.js';
import { WorkbenchPanel, type WorkbenchRunControl } from './panels/WorkbenchPanel.js';
import { TextsPanel } from './panels/TextsPanel.js';
import { RunsPanel } from './panels/RunsPanel.js';
import { PromptsPanel } from './panels/PromptsPanel.js';
import { ReviewPanel } from './panels/ReviewPanel.js';

type Tab = 'workbench' | 'texts' | 'runs' | 'prompts' | 'review';

export function App() {
  const [tab, setTab] = useState<Tab>('workbench');
  const [meta, setMeta] = useState<LabMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [runsKey, setRunsKey] = useState(0);
  const runControlRef = useRef<WorkbenchRunControl | null>(null);
  const [workbenchRunning, setWorkbenchRunning] = useState(false);
  const loadRef = useRef<WorkbenchLoadState | null>(null);
  const [loadTick, setLoadTick] = useState(0);

  const onRunControl = useCallback((control: WorkbenchRunControl | null) => {
    runControlRef.current = control;
    setWorkbenchRunning((prev) => {
      const next = control?.running ?? false;
      return prev === next ? prev : next;
    });
  }, []);

  useEffect(() => {
    void fetchMeta()
      .then((m) => {
        setMeta(m);
        setMetaError(null);
      })
      .catch((e: unknown) => {
        setMetaError(e instanceof Error ? e.message : 'Failed to load meta');
      });
  }, []);

  const pushWorkbenchLoad = useCallback((state: WorkbenchLoadState) => {
    loadRef.current = state;
    setLoadTick((n) => n + 1);
    setTab('workbench');
  }, []);

  const onTextLoad = useCallback(
    (text: LabText) => {
      pushWorkbenchLoad({
        sourceLanguage: text.sourceLanguage,
        targetLanguage: text.targetLanguage,
        sourceText: normalizeLabSourceText(text.content),
        translatedText: text.translatedText?.trim()
          ? normalizeLabTranslatedText(text.translatedText)
          : '',
        glossarySnapshot: text.glossarySnapshot,
        stage: (text.stageHint as LabStage) ?? undefined,
      });
    },
    [pushWorkbenchLoad]
  );

  const onRunReplay = useCallback(
    (run: LabRun) => {
      const params = run.params;
      pushWorkbenchLoad({
        stage: run.stage,
        sourceLanguage: params.sourceLanguage as WorkbenchLoadState['sourceLanguage'],
        targetLanguage: params.targetLanguage as WorkbenchLoadState['targetLanguage'],
        sourceText: normalizeLabSourceText(run.inputSnapshot.sourceText),
        translatedText: run.inputSnapshot.translatedText?.trim()
          ? normalizeLabTranslatedText(run.inputSnapshot.translatedText)
          : '',
        glossarySnapshot: run.inputSnapshot.glossarySnapshot ?? undefined,
        systemPrompt: run.inputSnapshot.systemPrompt,
        userPromptOverride: run.inputSnapshot.userPrompt,
        useUserOverride: Boolean(params.userPromptOverride),
        model: typeof params.model === 'string' ? params.model : undefined,
        temperature: typeof params.temperature === 'number' ? params.temperature : undefined,
        preset: params.preset as WorkbenchLoadState['preset'],
        focus: params.focus as WorkbenchLoadState['focus'],
        promptId: run.promptId,
        customInstructions:
          typeof params.customInstructions === 'string' ? params.customInstructions : undefined,
        chapterNumber: typeof params.chapterNumber === 'number' ? params.chapterNumber : undefined,
        includeGlossary: params.includeGlossary !== false,
        chunkSize: typeof params.chunkSize === 'number' ? params.chunkSize : undefined,
        enableTranslateFewShot: params.enableTranslateFewShot === true,
        enableTranslateCoT: params.enableTranslateCoT === true,
        enableTranslateStructuredCoT: params.enableTranslateStructuredCoT === true,
        translateLeadingContextParagraphs:
          typeof params.translateLeadingContextParagraphs === 'number'
            ? params.translateLeadingContextParagraphs
            : undefined,
        miniModelTranslationProfile: params.miniModelTranslationProfile === true,
        forceChunked: params.forceChunked === true,
        translateExecutionMode:
          typeof params.translateExecutionMode === 'string'
            ? normalizeTranslateExecutionMode(params.translateExecutionMode)
            : typeof params.translateQualityPreset === 'string'
              ? normalizeTranslateExecutionMode(params.translateQualityPreset)
              : undefined,
        editExecutionMode:
          typeof params.editExecutionMode === 'string'
            ? normalizeEditExecutionMode(params.editExecutionMode)
            : typeof params.editQualityPreset === 'string'
              ? normalizeEditExecutionMode(params.editQualityPreset)
              : undefined,
        runLabel: typeof params.runLabel === 'string' ? params.runLabel : undefined,
      });
    },
    [pushWorkbenchLoad]
  );

  const onPromptLoad = useCallback(
    (prompt: LabPrompt) => {
      pushWorkbenchLoad({
        stage: prompt.stage,
        sourceLanguage: prompt.sourceLanguage,
        targetLanguage: prompt.targetLanguage,
        systemPrompt: prompt.systemPrompt,
        userPromptOverride: prompt.userPromptOverride ?? undefined,
        useUserOverride: Boolean(prompt.userPromptOverride),
        preset: prompt.preset ?? undefined,
        focus: prompt.focus ?? undefined,
        promptId: prompt.id,
      });
    },
    [pushWorkbenchLoad]
  );

  return (
    <>
      <header class="pl-app-header">
        <h1>Arcane Prompt Lab</h1>
        <span class="pl-muted">dev-only — isolated from production prompts</span>
        <div class="pl-header-actions">
          <button
            type="button"
            class={`pl-btn${tab === 'review' ? '' : ' secondary'}`}
            onClick={() => setTab('review')}
          >
            Review
          </button>
          {tab === 'workbench' ? (
            <button
              type="button"
              class="pl-btn"
              disabled={workbenchRunning}
              onClick={() => runControlRef.current?.run()}
            >
              {workbenchRunning ? 'Running…' : 'Run stage'}
            </button>
          ) : null}
        </div>
      </header>

      {metaError ? (
        <div class="pl-banner error" role="alert">
          Failed to load configuration: {metaError}. Check that the API is running on port 3000.
        </div>
      ) : null}

      <nav class="pl-tab-nav">
        {(
          [
            ['workbench', 'Workbench'],
            ['texts', 'Saved texts'],
            ['runs', 'Run history'],
            ['prompts', 'Prompt versions'],
          ] as const
        ).map(([id, label]) => (
          <button
            type="button"
            key={id}
            class={`pl-tab${tab === id ? ' active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div class={`pl-panel${tab === 'workbench' ? ' active' : ''}`}>
        <WorkbenchPanel
          key={loadTick}
          meta={meta}
          initialLoad={loadRef.current}
          onRunSaved={() => setRunsKey((n) => n + 1)}
          onRunControl={onRunControl}
        />
      </div>
      <div class={`pl-panel${tab === 'texts' ? ' active' : ''}`}>
        <TextsPanel active={tab === 'texts'} onLoad={onTextLoad} />
      </div>
      <div class={`pl-panel${tab === 'runs' ? ' active' : ''}`}>
        <RunsPanel key={runsKey} active={tab === 'runs'} onReplay={onRunReplay} />
      </div>
      <div class={`pl-panel${tab === 'prompts' ? ' active' : ''}`}>
        <PromptsPanel active={tab === 'prompts'} onLoad={onPromptLoad} />
      </div>
      <div class={`pl-panel${tab === 'review' ? ' active' : ''}`}>
        <ReviewPanel active={tab === 'review'} meta={meta} />
      </div>
    </>
  );
}
