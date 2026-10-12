import { api, readBody } from '@/lib/http';
import { AppError, credentialsFrom, resolvePrompt, validId, validateInput } from '@/lib/validation';
import { loadCatalog } from '@/lib/catalog';
import { compare } from '@/lib/providers';
import { createServerClient, createServiceClient } from '@/lib/supabase-server';
import { executeSaved, once, requestFingerprint, selectedCatalog } from '@/lib/execution';
import { insertRun, ownedRun } from '@/lib/repository';
import type { Credentials, Run } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  return api(async () => {
    const body = await readBody(request);
    const input = validateInput(body);
    const id = validId(String(body.id ?? ''));
    const requestId = validId(String(body.request_id ?? ''));
    const supplied = credentialsFrom(body.credentials);
    const client = await createServerClient();
    const admin = createServiceClient();
    const user = client ? (await client.auth.getUser()).data.user : null;
    const hosted = body.use_hosted === true;
    if (hosted && (!user || !client || !admin)) throw new AppError(401, 'Hosted runs need sign-in and configured cloud execution. You can use your own key now.');
    const credentials: Credentials = hosted ? { openrouter: process.env.OPENROUTER_API_KEY, openai: process.env.OPENAI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY, google: process.env.GOOGLE_API_KEY, mistral: process.env.MISTRAL_API_KEY } : supplied;
    const catalog = await loadCatalog();
    const models = selectedCatalog(input, catalog, credentials);
    const scope = user?.id ?? 'guest';
    return once(`${scope}:${id}:${requestId}`, requestFingerprint(input, credentials, null), async () => {
      if (user && client && admin && (hosted || body.save !== false)) {
        try {
          const existing = await ownedRun(client, user.id, id);
          if (existing.resolved_prompt !== resolvePrompt(input.prompt, input.variables) || existing.prompt !== input.prompt ||
              JSON.stringify(existing.models) !== JSON.stringify(input.models) || existing.seed !== input.seed || existing.max_output_tokens !== input.max_output_tokens) {
            throw new AppError(409, 'Run identifier already has different input.');
          }
        } catch (error) {
          if (!(error instanceof AppError) || error.status !== 404) throw error;
          await insertRun(client, user.id, input, id);
        }
        return executeSaved(client, admin, user.id, id, requestId, credentials, catalog, null, !hosted);
      }
      const results = await compare(input, models, credentials);
      const now = new Date().toISOString();
      const run: Run = { ...input, id, resolved_prompt: resolvePrompt(input.prompt, input.variables), is_public: false,
        created_at: now, updated_at: now, executed_at: now, status: results.some(result => !result.error) ? 'completed' : 'error' };
      return { run, results, saved: false, ...(user ? { warning: body.save === false ?
        'This comparison was kept in this tab. Export it to keep a copy.' :
        'Cloud execution storage is not configured. This comparison is available in this tab; export it to keep a copy.' } : {}) };
    });
  });
}
