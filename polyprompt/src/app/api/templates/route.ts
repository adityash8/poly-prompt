import { api, readBody } from '@/lib/http';
import { STARTER_TEMPLATES } from '@/lib/templates';
import { createServerClient, requireUser } from '@/lib/supabase-server';
import { AppError, record, resolvePrompt } from '@/lib/validation';
export async function GET(request: Request) {
  return api(async () => {
    const category = new URL(request.url).searchParams.get('category');
    const starters = STARTER_TEMPLATES.filter(template => !category || category === 'all' || template.category === category);
    const client = await createServerClient();
    const user = client ? (await client.auth.getUser()).data.user : null;
    if (!client || !user) return starters;
    let query = client.from('polyprompt_templates').select('id,title,description,prompt,category,variables').eq('created_by', user.id);
    if (category && category !== 'all') query = query.eq('category', category);
    const { data, error } = await query;
    if (error) throw new AppError(503, 'Your saved templates could not be loaded. Starter prompts remain available in the comparison editor.');
    return [...starters, ...(data ?? [])];
  });
}
export async function POST(request: Request) {
  return api(async () => {
    const { supabase, user } = await requireUser();
    const body = await readBody(request);
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 120 ||
        typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 4000) throw new AppError(400, 'Provide a title up to 120 characters and a prompt up to 4,000 characters.');
    const variables = record(body.variables ?? {});
    if (Object.keys(variables).length > 50 || Object.entries(variables).some(([key, value]) => !/^[a-zA-Z_][\w]*$/.test(key) || typeof value !== 'string' || value.length > 4000)) throw new AppError(400, 'Use simple variable names and text values.');
    resolvePrompt(body.prompt, variables as Record<string, string>);
    const { data, error } = await supabase.from('polyprompt_templates').insert({ title: body.title.trim(), prompt: body.prompt,
      description: 'Personal template', category: 'general', variables, created_by: user.id }).select().single();
    if (error) throw new AppError(503, 'Template could not be saved. Check cloud history setup.');
    return data;
  });
}
