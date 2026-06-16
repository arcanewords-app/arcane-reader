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
import { WorkbenchPanel } from './panels/WorkbenchPanel.js';
import { TextsPanel } from './panels/TextsPanel.js';
import { RunsPanel } from './panels/RunsPanel.js';
import { PromptsPanel } from './panels/PromptsPanel.js';

type Tab = 'workbench' | 'texts' | 'runs' | 'prompts';

export function App() {
  const [tab, setTab] = useState<Tab>('workbench');
  const [meta, setMeta] = useState<LabMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [runsKey, setRunsKey] = useState(0);
  const loadRef = useRef<WorkbenchLoadState | null>(null);
  const [loadTick, setLoadTick] = useState(0);

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
        sourceText: text.content,
        translatedText: text.translatedText ?? '',
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
        sourceText: run.inputSnapshot.sourceText,
        translatedText: run.inputSnapshot.translatedText ?? '',
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
    </>
  );
}
