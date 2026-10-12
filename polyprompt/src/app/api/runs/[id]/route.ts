import { api, assertSameOrigin, readBody } from '@/lib/http';
import { requireUser } from '@/lib/supabase-server';
import { ownedRun } from '@/lib/repository';
import { AppError } from '@/lib/validation';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => { const { supabase, user } = await requireUser(); return ownedRun(supabase, user.id, (await params).id); });
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { supabase, user } = await requireUser();
    const run = await ownedRun(supabase, user.id, (await params).id);
    const body = await readBody(request);
    if (Object.keys(body).some(key => key !== 'title') || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 120) {
      throw new AppError(400, 'Only a title of 1 to 120 characters may be changed. Replay to change a prompt or models.');
    }
    const { data, error } = await supabase.from('polyprompt_runs').update({ title: body.title.trim() }).eq('id', run.id).eq('user_id', user.id).select().single();
    if (error) throw new AppError(503, 'Run could not be updated.');
    return data;
  });
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    assertSameOrigin(request);
    const { supabase, user } = await requireUser();
    const run = await ownedRun(supabase, user.id, (await params).id);
    if (run.status === 'running') throw new AppError(409, 'Wait for this run to finish before deleting it.');
    const { error } = await supabase.from('polyprompt_runs').delete().eq('id', run.id).eq('user_id', user.id);
    if (error) throw new AppError(503, 'Run could not be deleted.');
    return { deleted: true };
  });
}
