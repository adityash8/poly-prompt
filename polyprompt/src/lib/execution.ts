import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Comparison, Credentials, ModelConfig, Run, RunInput } from '@/types';
import { AppError } from '@/lib/validation';
import { canExecute, compare } from '@/lib/providers';
import { ownedRun, runResults } from '@/lib/repository';

const pending = new Map<string, { fingerprint: string; promise: Promise<Comparison>; expires: number }>();

export function once(key: string, fingerprint: string, work: () => Promise<Comparison>): Promise<Comparison> {
  for (const [id, entry] of pending) if (entry.expires < Date.now()) pending.delete(id);
  const existing = pending.get(key);
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new AppError(409, 'This request identifier has already been used with different input.');
    return existing.promise;
  }
  if (pending.size >= 200) throw new AppError(429, 'Too many comparisons are active. Please retry shortly.');
  const promise = work();
  pending.set(key, { fingerprint, promise, expires: Date.now() + 300000 });
  promise.catch(() => pending.delete(key));
  return promise;
}

export function requestFingerprint(input: RunInput, credentials: Credentials, retry: string[] | null) {
  const fields: RunInput = { title: input.title, prompt: input.prompt, variables: input.variables,
    models: input.models, seed: input.seed, max_output_tokens: input.max_output_tokens };
  return createHash('sha256').update(JSON.stringify({ input: fields, credentials, retry })).digest('hex');
}

export function selectedCatalog(input: RunInput, catalog: ModelConfig[], credentials: Credentials, selected = input.models) {
  const models = selected.map(id => catalog.find(model => model.id === id));
  if (models.some(model => !model)) throw new AppError(400, 'A selected model is no longer in the live catalog. Refresh the catalog and select a current model.');
  if (models.some(model => !canExecute(model!.id, credentials))) throw new AppError(503, 'Add an OpenRouter key or a native provider key for every selected model. No requests have been sent.');
  return models as ModelConfig[];
}

export async function executeSaved(client: SupabaseClient, admin: SupabaseClient, userId: string,
  id: string, requestId: string, credentials: Credentials, catalog: ModelConfig[], retry: string[] | null, byok: boolean): Promise<Comparison> {
  const run = await ownedRun(client, userId, id);
  const previous = await runResults(client, id);
  if (!retry && run.executed_at && run.status !== 'running') return { run, results: previous, saved: true };
  const models = selectedCatalog(run, catalog, credentials, retry ?? run.models);
  const { data: reservation, error } = await admin.rpc('polyprompt_reserve_execution', {
    p_user_id: userId, p_run_id: id, p_request_id: requestId, p_retry_models: retry, p_byok: byok,
  });
  if (error) {
    const message = error.message;
    if (message.includes('reused_run_id')) throw new AppError(409, 'This run identifier has already been used. Start a new comparison.');
    if (message.includes('invalid_retry')) throw new AppError(400, 'Only failed models can be retried. Replay creates a new comparison.');
    if (message.includes('quota_exceeded')) throw new AppError(429, 'You have used 50 hosted comparisons this month. Add your own provider key or wait for the next calendar month.');
    if (message.includes('model_limit')) throw new AppError(403, 'Free hosted comparisons allow two models. Add your own key to compare up to ten.');
    if (message.includes('execution_busy')) throw new AppError(409, 'This comparison already started. Reload its history before retrying. If interrupted, replay as a new run; provider charges may apply.');
    throw new AppError(503, 'Execution storage is not ready. Apply the supplied Supabase migration; no provider call was sent.');
  }
  if (reservation?.cached) return { run: await ownedRun(client, userId, id), results: await runResults(client, id), saved: true };
  const next = await compare(run, models, credentials);
  const results = [...previous.filter(result => !next.some(update => update.model === result.model)), ...next];
  const status = results.some(result => !result.error) ? 'completed' : 'error';
  const finishedRun: Run = { ...run, status, executed_at: run.executed_at ?? new Date().toISOString(), updated_at: new Date().toISOString() };
  const { error: saveError } = await admin.rpc('polyprompt_finish_execution', {
    p_user_id: userId, p_run_id: id, p_request_id: requestId, p_results: next,
  });
  if (saveError) return { run: finishedRun, results, saved: false,
    warning: 'Provider responses arrived, but cloud saving failed. Export these results now. Reload before sending another request to avoid duplicate provider charges.' };
  return { run: finishedRun, results, saved: true };
}
