import { api } from '@/lib/http';
import { requireUser } from '@/lib/supabase-server';
import { ownedRun, runResults } from '@/lib/repository';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { supabase, user } = await requireUser();
    const run = await ownedRun(supabase, user.id, (await params).id);
    return runResults(supabase, run.id);
  });
}
