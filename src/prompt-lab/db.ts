/**
 * Prompt Lab Supabase persistence (dev-only, service role).
 */

import { createServiceRoleClient } from '../services/supabaseClient.js';
import type {
  PromptLabPromptRow,
  PromptLabRunRow,
  PromptLabTextRow,
  PromptLabEvaluationRow,
} from './types.js';

function db() {
  return createServiceRoleClient();
}

export async function listPromptLabTexts(): Promise<PromptLabTextRow[]> {
  const { data, error } = await db()
    .from('prompt_lab_texts')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PromptLabTextRow[];
}

export async function getPromptLabText(id: string): Promise<PromptLabTextRow | null> {
  const { data, error } = await db()
    .from('prompt_lab_texts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PromptLabTextRow | null) ?? null;
}

export async function insertPromptLabText(
  row: Omit<PromptLabTextRow, 'id' | 'created_at' | 'updated_at'>
): Promise<PromptLabTextRow> {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from('prompt_lab_texts')
    .insert({ ...row, created_at: now, updated_at: now })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as PromptLabTextRow;
}

export async function updatePromptLabText(
  id: string,
  patch: Partial<Omit<PromptLabTextRow, 'id' | 'created_at'>>
): Promise<PromptLabTextRow> {
  const { data, error } = await db()
    .from('prompt_lab_texts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as PromptLabTextRow;
}

export async function deletePromptLabText(id: string): Promise<void> {
  const { error } = await db().from('prompt_lab_texts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listPromptLabPrompts(filters?: {
  stage?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}): Promise<PromptLabPromptRow[]> {
  let q = db().from('prompt_lab_prompts').select('*').order('updated_at', { ascending: false });
  if (filters?.stage) q = q.eq('stage', filters.stage);
  if (filters?.sourceLanguage) q = q.eq('source_language', filters.sourceLanguage);
  if (filters?.targetLanguage) q = q.eq('target_language', filters.targetLanguage);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as PromptLabPromptRow[];
}

export async function getPromptLabPrompt(id: string): Promise<PromptLabPromptRow | null> {
  const { data, error } = await db()
    .from('prompt_lab_prompts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PromptLabPromptRow | null) ?? null;
}

export async function insertPromptLabPrompt(
  row: Omit<PromptLabPromptRow, 'id' | 'created_at' | 'updated_at'>
): Promise<PromptLabPromptRow> {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from('prompt_lab_prompts')
    .insert({ ...row, created_at: now, updated_at: now })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as PromptLabPromptRow;
}

export async function updatePromptLabPrompt(
  id: string,
  patch: Partial<Omit<PromptLabPromptRow, 'id' | 'created_at'>>
): Promise<PromptLabPromptRow> {
  const { data, error } = await db()
    .from('prompt_lab_prompts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as PromptLabPromptRow;
}

export async function deletePromptLabPrompt(id: string): Promise<void> {
  const { error } = await db().from('prompt_lab_prompts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listPromptLabRuns(limit = 50): Promise<PromptLabRunRow[]> {
  const { data, error } = await db()
    .from('prompt_lab_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as PromptLabRunRow[];
}

export async function getPromptLabRun(id: string): Promise<PromptLabRunRow | null> {
  const { data, error } = await db().from('prompt_lab_runs').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PromptLabRunRow | null) ?? null;
}

export async function insertPromptLabRun(
  row: Omit<PromptLabRunRow, 'id' | 'created_at'>
): Promise<PromptLabRunRow> {
  const { data, error } = await db().from('prompt_lab_runs').insert(row).select('*').single();
  if (error) throw new Error(error.message);
  return data as PromptLabRunRow;
}

export async function updatePromptLabRun(
  id: string,
  patch: Partial<Pick<PromptLabRunRow, 'display_name'>>
): Promise<PromptLabRunRow> {
  const { data, error } = await db()
    .from('prompt_lab_runs')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as PromptLabRunRow;
}

export async function deletePromptLabRun(id: string): Promise<void> {
  const { error } = await db().from('prompt_lab_runs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listPromptLabEvaluations(filters?: {
  runId?: string;
  limit?: number;
}): Promise<PromptLabEvaluationRow[]> {
  const limit = filters?.limit ?? 50;
  let q = db()
    .from('prompt_lab_evaluations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (filters?.runId) {
    q = q.or(`left_run_id.eq.${filters.runId},right_run_id.eq.${filters.runId}`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as PromptLabEvaluationRow[];
}

export async function getPromptLabEvaluation(id: string): Promise<PromptLabEvaluationRow | null> {
  const { data, error } = await db()
    .from('prompt_lab_evaluations')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PromptLabEvaluationRow | null) ?? null;
}

export async function insertPromptLabEvaluation(
  row: Omit<PromptLabEvaluationRow, 'id' | 'created_at'>
): Promise<PromptLabEvaluationRow> {
  const { data, error } = await db()
    .from('prompt_lab_evaluations')
    .insert(row)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as PromptLabEvaluationRow;
}

export async function deletePromptLabEvaluation(id: string): Promise<void> {
  const { error } = await db().from('prompt_lab_evaluations').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
