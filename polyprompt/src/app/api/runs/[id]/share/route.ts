import { randomBytes } from 'node:crypto';
import { api, assertSameOrigin, requestOrigin } from '@/lib/http';
import { requireUser, createServiceClient } from '@/lib/supabase-server';
import { ownedRun } from '@/lib/repository';
import { AppError } from '@/lib/validation';

async function share(request: Request, id: string, enabled: boolean) {
  assertSameOrigin(request);
  const { supabase, user } = await requireUser();
  const run = await ownedRun(supabase, user.id, id);
  if (enabled && !run.executed_at) throw new AppError(400, 'Execute this run before sharing.');
  const admin = createServiceClient();
  if (!admin) throw new AppError(503, 'Share links need SUPABASE_SERVICE_ROLE_KEY on the server and the supplied schema migration. Export JSON or CSV instead.');
  const token = enabled ? randomBytes(32).toString('hex') : null;
  const { data, error } = await admin.rpc('polyprompt_set_run_share', { p_user_id: user.id, p_run_id: id, p_token: token });
  if (error || !data) throw new AppError(503, 'The share link could not be updated. Check the supplied Supabase migration.');
  return { shareId: data.share_id, shareUrl: token ? `${requestOrigin(request)}/shared/${token}` : null,
    expiresAt: data.share_expires_at };
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => share(request, (await params).id, true));
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => share(request, (await params).id, false));
}
