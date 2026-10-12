import { api } from '@/lib/http';
import { requireUser } from '@/lib/supabase-server';
import { ownedRun, runResults } from '@/lib/repository';
import { exportComparison } from '@/lib/export';
import { AppError } from '@/lib/validation';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { supabase, user } = await requireUser();
    const format = new URL(request.url).searchParams.get('format') ?? 'json';
    if (format !== 'json' && format !== 'csv') throw new AppError(400, 'Choose JSON or CSV.');
    const run = await ownedRun(supabase, user.id, (await params).id);
    return new Response(exportComparison({ run, results: await runResults(supabase, run.id), saved: true }, format), {
      headers: { 'Content-Type': format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json',
        'Content-Disposition': `attachment; filename="poly-prompt-${run.id}.${format}"`, 'Cache-Control': 'no-store' },
    });
  });
}
