import { api, assertSameOrigin, readBody } from '@/lib/http';
import { requireUser, createServiceClient } from '@/lib/supabase-server';
import { AppError, validateInput } from '@/lib/validation';
import { history, insertRun } from '@/lib/repository';
export async function GET(request: Request) {
  return api(async () => {
    const { supabase, user } = await requireUser();
    const params = new URL(request.url).searchParams;
    const page = Number(params.get('page') ?? 0);
    if (!Number.isInteger(page) || page < 0 || page > 10000) throw new AppError(400, 'Invalid history page.');
    const admin = createServiceClient();
    if (admin) {
      const { error } = await admin.rpc('polyprompt_prune_expired_runs', { p_user_id: user.id });
      if (error) throw new AppError(503, 'History retention needs the supplied Supabase migration.');
    }
    return history(supabase, user.id, page, (params.get('search') ?? '').slice(0, 120));
  });
}
export async function POST(request: Request) {
  return api(async () => {
    const { supabase, user } = await requireUser();
    return insertRun(supabase, user.id, validateInput(await readBody(request)));
  });
}
export async function DELETE(request: Request) {
  return api(async () => {
    assertSameOrigin(request);
    const { supabase, user } = await requireUser();
    const admin = createServiceClient();
    if (!admin) throw new AppError(503, 'Cloud deletion needs SUPABASE_SERVICE_ROLE_KEY on the server to remove expired comparisons too.');
    const { error: retentionError } = await admin.rpc('polyprompt_prune_expired_runs', { p_user_id: user.id });
    if (retentionError) throw new AppError(503, 'Expired comparisons could not be removed. Check the supplied Supabase schema and retry.');
    const { error } = await supabase.from('polyprompt_runs').delete().eq('user_id', user.id);
    if (error) throw new AppError(503, 'Your runs could not be deleted. Please retry.');
    return { deleted: true };
  });
}
