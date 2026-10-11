import type { SupabaseClient } from '@supabase/supabase-js';
import type { Eval, Run, RunInput } from '@/types';
import { AppError, resolvePrompt, validId } from '@/lib/validation';

export async function profileFor(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from('polyprompt_profiles').select('tier').eq('id', userId).single();
  if (error || !data) throw new AppError(503, 'Cloud history schema is not ready. Apply the supplied Supabase schema and migration.');
  return data as { tier: 'free' | 'pro' | 'team' };
}

export async function ownedRun(client: SupabaseClient, userId: string, id: string): Promise<Run> {
  validId(id);
  const profile = await profileFor(client, userId);
  let query = client.from('polyprompt_runs').select('*').eq('id', id).eq('user_id', userId);
  if (profile.tier === 'free') query = query.gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString());
  const { data, error } = await query.maybeSingle();
  if (error) throw new AppError(503, 'Cloud history is unavailable. Please retry.');
  if (!data) throw new AppError(404, 'Run not found or outside your retention period.');
  return data as Run;
}

export async function runResults(client: SupabaseClient, id: string): Promise<Eval[]> {
  const { data, error } = await client.from('polyprompt_evals').select('*').eq('run_id', id).order('created_at', { ascending: true });
  if (error) throw new AppError(503, 'Results could not be loaded. Please retry.');
  return (data ?? []) as Eval[];
}

export async function insertRun(client: SupabaseClient, userId: string, input: RunInput, id = crypto.randomUUID()): Promise<Run> {
  const { data, error } = await client.from('polyprompt_runs').insert({ ...input, id, user_id: userId,
    resolved_prompt: resolvePrompt(input.prompt, input.variables) }).select().single();
  if (error || !data) throw new AppError(503, 'The run could not be saved. Check the supplied Supabase schema and migration.');
  return data as Run;
}

export async function history(client: SupabaseClient, userId: string, page: number, search = '') {
  const profile = await profileFor(client, userId);
  let query = client.from('polyprompt_runs').select('*', { count: 'exact' }).eq('user_id', userId).order('created_at', { ascending: false });
  if (profile.tier === 'free') query = query.gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString());
  if (search) query = query.ilike('prompt', `%${search.replace(/[\\%_]/g, char => '\\' + char)}%`);
  const { data, error, count } = await query.range(page * 50, page * 50 + 49);
  if (error) throw new AppError(503, 'Cloud history could not be loaded. Please retry.');
  return { runs: (data ?? []) as Run[], total: count ?? 0, page };
}
