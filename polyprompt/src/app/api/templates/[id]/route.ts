import { api, assertSameOrigin } from '@/lib/http';
import { requireUser } from '@/lib/supabase-server';
import { AppError, validId } from '@/lib/validation';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    assertSameOrigin(request);
    const { supabase, user } = await requireUser();
    const id = validId((await params).id);
    const { data, error } = await supabase.from('polyprompt_templates').delete().eq('id', id).eq('created_by', user.id).select('id').maybeSingle();
    if (error) throw new AppError(503, 'Template could not be deleted. Please retry.');
    if (!data) throw new AppError(404, 'Personal template not found.');
    return { deleted: true };
  });
}
