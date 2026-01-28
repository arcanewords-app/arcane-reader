/**
 * Translation Pipeline - Orchestrates the 3-stage translation process
 * 
 * Stage 1: Analyze (Agent) - Extract entities, analyze style
 * Stage 2: Translate - Accurate translation with glossary
 * Stage 3: Edit - Polish and refine
 */

import type { ILLMProvider } from '../interfaces/llm-provider.js';
import type { PipelineResult, PipelineOptions } from '../types/pipeline.js';
import type { ChapterSummary } from '../types/agent.js';
import { NovelAgent } from '../agents/novel-agent.js';
import { AnalyzeStage } from '../stages/stage-1-analyze.js';
import { TranslateStage } from '../stages/stage-2-translate.js';
import { EditStage } from '../stages/stage-3-edit.js';

export interface PipelineConfig {
  // Support both single provider (legacy) and per-stage providers
  provider?: ILLMProvider; // Legacy: single provider for all stages
  providers?: {
    analysis: ILLMProvider;
    translation: ILLMProvider;
    editing: ILLMProvider;
  };
  agent: NovelAgent;
}

export class TranslationPipeline {
  private providers: {
    analysis: ILLMProvider;
    translation: ILLMProvider;
    editing: ILLMProvider;
  };
  private agent: NovelAgent;
  
  private analyzeStage: AnalyzeStage;
  private translateStage: TranslateStage;
  private editStage: EditStage;
  
  constructor(config: PipelineConfig) {
    console.log(`[Pipeline Constructor] Starting initialization...`);
    console.log(`[Pipeline Constructor] config.providers: ${!!config.providers}, config.provider: ${!!config.provider}, config.agent: ${!!config.agent}`);
    
    // Support legacy single provider or new per-stage providers
    if (config.providers) {
      console.log(`[Pipeline Constructor] Using per-stage providers`);
      this.providers = config.providers;
      console.log(`[Pipeline Constructor] Providers assigned: analysis=${!!this.providers.analysis}, translation=${!!this.providers.translation}, editing=${!!this.providers.editing}`);
    } else if (config.provider) {
      // Legacy: use same provider for all stages
      console.log(`[Pipeline Constructor] Using legacy single provider`);
      this.providers = {
        analysis: config.provider,
        translation: config.provider,
        editing: config.provider,
      };
    } else {
      throw new Error('Either provider or providers must be provided');
    }
    
    // Validate providers
    if (!this.providers.analysis || !this.providers.translation || !this.providers.editing) {
      console.error(`[Pipeline Constructor] Provider validation failed:`, {
        analysis: !!this.providers.analysis,
        translation: !!this.providers.translation,
        editing: !!this.providers.editing,
      });
      throw new Error('All stage providers must be provided');
    }
    
    // Validate providers have required methods
    console.log(`[Pipeline Constructor] Validating provider methods...`);
    if (typeof this.providers.analysis.completeJSON !== 'function') {
      console.error(`[Pipeline Constructor] Analysis provider missing completeJSON. Provider:`, this.providers.analysis);
      throw new Error('Analysis provider is missing completeJSON method (needed for structured output)');
    }
    if (typeof this.providers.translation.complete !== 'function') {
      console.error(`[Pipeline Constructor] Translation provider missing complete. Provider:`, this.providers.translation);
      throw new Error('Translation provider is missing complete method');
    }
    if (typeof this.providers.editing.complete !== 'function') {
      console.error(`[Pipeline Constructor] Editing provider missing complete. Provider:`, this.providers.editing);
      throw new Error('Editing provider is missing complete method');
    }
    // Editing stage also needs completeJSON for quality check
    if (typeof this.providers.editing.completeJSON !== 'function') {
      console.warn('[Pipeline Constructor] Editing provider missing completeJSON - quality check will be skipped');
    }
    
    this.agent = config.agent;
    
    // Create stages with validated providers
    console.log(`[Pipeline Constructor] Creating stages with validated providers:`);
    console.log(`  - analysis: ${!!this.providers.analysis}, type: ${typeof this.providers.analysis}, model: ${(this.providers.analysis as any)?.model || 'unknown'}, has completeJSON: ${typeof this.providers.analysis?.completeJSON}`);
    console.log(`  - translation: ${!!this.providers.translation}, type: ${typeof this.providers.translation}, model: ${(this.providers.translation as any)?.model || 'unknown'}, has complete: ${typeof this.providers.translation?.complete}`);
    console.log(`  - editing: ${!!this.providers.editing}, type: ${typeof this.providers.editing}, model: ${(this.providers.editing as any)?.model || 'unknown'}, has complete: ${typeof this.providers.editing?.complete}`);
    
    if (!this.providers.analysis) {
      throw new Error('Analysis provider is undefined before stage creation');
    }
    if (!this.providers.translation) {
      throw new Error('Translation provider is undefined before stage creation');
    }
    if (!this.providers.editing) {
      throw new Error('Editing provider is undefined before stage creation');
    }
    
    console.log(`[Pipeline Constructor] Creating AnalyzeStage...`);
    this.analyzeStage = new AnalyzeStage(this.providers.analysis);
    console.log(`[Pipeline Constructor] AnalyzeStage created: ${!!this.analyzeStage}`);
    
    console.log(`[Pipeline Constructor] Creating TranslateStage...`);
    this.translateStage = new TranslateStage(this.providers.translation);
    console.log(`[Pipeline Constructor] TranslateStage created: ${!!this.translateStage}`);
    
    console.log(`[Pipeline Constructor] Creating EditStage...`);
    this.editStage = new EditStage(this.providers.editing);
    console.log(`[Pipeline Constructor] EditStage created: ${!!this.editStage}`);
    
    console.log(`[Pipeline Constructor] All stages created successfully`);
    
    // Verify stages were created successfully
    if (!this.analyzeStage || !this.translateStage || !this.editStage) {
      throw new Error('Failed to create translation stages');
    }
    
    console.log(`[Pipeline Constructor] Initialization complete`);
  }
  
  /**
   * Translate a chapter through the 3-stage pipeline
   */
  async translateChapter(
    sourceText: string,
    chapterNumber: number,
    options: PipelineOptions = {}
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    let totalTokens = 0;
    
    // Get current context
    const context = this.agent.getContext();
    
    // ============ STAGE 1: ANALYZE ============
    let stage1Result;
    
    if (!options.skipAnalysis) {
      console.log(`[Pipeline] Stage 1: Analyzing chapter ${chapterNumber}...`);
      
      stage1Result = await this.analyzeStage.execute(sourceText, {
        chapterNumber,
        existingGlossary: context.glossary,
      });
      
      totalTokens += stage1Result.tokensUsed;
      
      if (stage1Result.success && stage1Result.data) {
        // Apply analysis results to agent
        this.agent.applyAnalysisResult(stage1Result.data);
        console.log(`[Pipeline] Stage 1 complete. Found ${stage1Result.data.foundCharacters.length} characters, ${stage1Result.data.foundTerms.length} terms.`);
      } else {
        console.warn(`[Pipeline] Stage 1 failed: ${stage1Result.error}`);
      }
    } else {
      stage1Result = {
        stage: 'analyze' as const,
        success: true,
        tokensUsed: 0,
        duration: 0,
      };
      console.log('[Pipeline] Stage 1: Skipped (using existing glossary)');
    }
    
    // ============ STAGE 2: TRANSLATE ============
    console.log(`[Pipeline] Stage 2: Translating...`);
    console.log(`[Pipeline] translateStage exists: ${!!this.translateStage}, type: ${typeof this.translateStage}`);
    
    const updatedContext = this.agent.getContext();
    
    const stage2Result = await this.translateStage.execute(sourceText, {
      context: updatedContext,
      chunkSize: options.chunkSize,
    });
    
    totalTokens += stage2Result.tokensUsed;
    
    if (!stage2Result.success || !stage2Result.data) {
      return this.createFailedResult(
        chapterNumber,
        sourceText,
        stage1Result,
        stage2Result,
        { stage: 'edit', success: false, tokensUsed: 0, duration: 0 },
        totalTokens,
        Date.now() - startTime,
        `Translation failed: ${stage2Result.error}`
      );
    }
    
    console.log(`[Pipeline] Stage 2 complete. Translated ${stage2Result.data.chunkResults.length} chunks.`);
    
    // ============ STAGE 3: EDIT ============
    let stage3Result;
    let finalTranslation: string;
    
    if (!options.skipEditing) {
      console.log(`[Pipeline] Stage 3: Editing...`);
      
      stage3Result = await this.editStage.execute(
        stage2Result.data.translatedText,
        sourceText,
        {
          context: updatedContext,
          checkQuality: true,
          chunkSize: options.chunkSize, // Pass chunkSize for chunked editing
        }
      );
      
      totalTokens += stage3Result.tokensUsed;
      
      if (stage3Result.success && stage3Result.data) {
        finalTranslation = stage3Result.data.finalText;
        console.log(`[Pipeline] Stage 3 complete. Quality score: ${stage3Result.data.qualityScore ?? 'N/A'}`);
      } else {
        // Use stage 2 result if editing fails
        finalTranslation = stage2Result.data.translatedText;
        console.warn(`[Pipeline] Stage 3 failed, using raw translation: ${stage3Result.error}`);
      }
    } else {
      stage3Result = {
        stage: 'edit' as const,
        success: true,
        tokensUsed: 0,
        duration: 0,
      };
      finalTranslation = stage2Result.data.translatedText;
      console.log('[Pipeline] Stage 3: Skipped');
    }
    
    // ============ RECORD CHAPTER ============
    const chapterSummary: ChapterSummary = {
      chapterNumber,
      summary: stage1Result.data?.chapterSummary ?? '',
      keyEvents: stage1Result.data?.keyEvents ?? [],
      activeCharacters: stage1Result.data?.foundCharacters.map(c => c.name) ?? [],
      location: stage1Result.data?.foundLocations[0]?.name ?? '',
    };
    
    this.agent.recordChapterTranslation(chapterSummary);
    
    const totalDuration = Date.now() - startTime;
    console.log(`[Pipeline] Translation complete in ${(totalDuration / 1000).toFixed(1)}s, ${totalTokens} tokens used.`);
    
    return {
      chapterNumber,
      originalText: sourceText,
      stage1: stage1Result,
      stage2: stage2Result,
      stage3: stage3Result,
      finalTranslation,
      totalTokensUsed: totalTokens,
      totalDuration,
      updatedContext: this.agent.getContext(),
    };
  }
  
  /**
   * Translate multiple chapters in sequence
   */
  async translateChapters(
    chapters: { text: string; number: number }[],
    options: PipelineOptions = {}
  ): Promise<PipelineResult[]> {
    const results: PipelineResult[] = [];
    
    for (const chapter of chapters) {
      console.log(`\n========== Chapter ${chapter.number} ==========\n`);
      const result = await this.translateChapter(chapter.text, chapter.number, options);
      results.push(result);
    }
    
    return results;
  }
  
  /**
   * Get the current agent (for saving state)
   */
  getAgent(): NovelAgent {
    return this.agent;
  }
  
  /**
   * Update the agent
   */
  setAgent(agent: NovelAgent): void {
    this.agent = agent;
  }
  
  private createFailedResult(
    chapterNumber: number,
    originalText: string,
    stage1: PipelineResult['stage1'],
    stage2: PipelineResult['stage2'],
    stage3: PipelineResult['stage3'],
    totalTokens: number,
    totalDuration: number,
    error: string
  ): PipelineResult {
    return {
      chapterNumber,
      originalText,
      stage1,
      stage2,
      stage3,
      finalTranslation: `[ERROR] ${error}`,
      totalTokensUsed: totalTokens,
      totalDuration,
      updatedContext: this.agent.getContext(),
    };
  }
}

