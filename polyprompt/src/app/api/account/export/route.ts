import { api } from '@/lib/http';
import { requireUser } from '@/lib/supabase-server';
import { history, runResults } from '@/lib/repository';
import { AppError } from '@/lib/validation';
export async function GET() {
  return api(async () => {
    const { supabase, user } = await requireUser();
    const [profile, templates, usage] = await Promise.all([
      supabase.from('polyprompt_profiles').select('email,full_name,avatar_url,tier,created_at,updated_at').eq('id', user.id).single(),
      supabase.from('polyprompt_templates').select('id,title,description,prompt,category,variables,created_at').eq('created_by', user.id),
      supabase.from('polyprompt_run_usage').select('run_id,charged,created_at').eq('user_id', user.id),
    ]);
    if (profile.error || templates.error || usage.error) throw new AppError(503, 'Cloud data could not be exported. Check the supplied schema and retry.');
    const comparisons = [];
    for (let page = 0; ; page++) {
      const { runs, total } = await history(supabase, user.id, page);
      const batch = await Promise.all(runs.map(async run => {
        const publicFields = { ...run };
        delete publicFields.user_id;
        return { run: publicFields, results: await runResults(supabase, run.id) };
      }));
      comparisons.push(...batch);
      if ((page + 1) * 50 >= total) break;
    }
    return new Response(JSON.stringify({ profile: profile.data, templates: templates.data, usage: usage.data, comparisons, exported_at: new Date().toISOString() }, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="poly-prompt-data.json"', 'Cache-Control': 'no-store' },
    });
  });
}
