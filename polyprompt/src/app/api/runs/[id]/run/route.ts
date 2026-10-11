import { api, readBody } from '@/lib/http';
import { AppError, credentialsFrom, validId } from '@/lib/validation';
import { requireUser, createServiceClient } from '@/lib/supabase-server';
import { loadCatalog } from '@/lib/catalog';
import { executeSaved, once, requestFingerprint } from '@/lib/execution';
import { ownedRun } from '@/lib/repository';
import type { Credentials } from '@/types';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { supabase, user } = await requireUser();
    const run = await ownedRun(supabase, user.id, (await params).id);
    const body = await readBody(request);
    const admin = createServiceClient();
    if (!admin) throw new AppError(503, 'Cloud execution needs SUPABASE_SERVICE_ROLE_KEY on the server. You can replay using your own key in this tab.');
    const requestId = validId(String(body.request_id ?? ''));
    const retry = body.retry_models ?? null;
    if (retry !== null && (!Array.isArray(retry) || retry.length > 10 || retry.some(model => typeof model !== 'string'))) throw new AppError(400, 'Invalid retry models.');
    const hosted = body.use_hosted === true;
    const credentials: Credentials = hosted ? { openrouter: process.env.OPENROUTER_API_KEY, openai: process.env.OPENAI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY, google: process.env.GOOGLE_API_KEY, mistral: process.env.MISTRAL_API_KEY } : credentialsFrom(body.credentials);
    return once(`${user.id}:${run.id}:${requestId}`, requestFingerprint(run, credentials, retry as string[] | null), () =>
      loadCatalog().then(catalog => executeSaved(supabase, admin, user.id, run.id, requestId, credentials, catalog, retry as string[] | null, !hosted)));
  });
}
