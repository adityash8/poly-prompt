import { api } from '@/lib/http';
import { supabaseConfigured } from '@/lib/supabase-config';
import { createServerClient, createServiceClient } from '@/lib/supabase-server';
export const dynamic = 'force-dynamic';
export async function GET() {
  return api(async () => {
    const client = await createServerClient();
    const { data } = client ? await client.auth.getUser() : { data: { user: null } };
    const admin = createServiceClient();
    // GET preserves missing-table errors; PostgREST's empty HEAD 404 can be normalized to success by the SDK.
    const schemaReady = admin ? !(await admin.from('polyprompt_profiles').select('id').limit(1)).error : false;
    const hosted = Boolean(schemaReady && (process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY || process.env.MISTRAL_API_KEY));
    const profile = client && data.user ? (await client.from('polyprompt_profiles').select('tier').eq('id', data.user.id).maybeSingle()).data : null;
    return { tier: profile?.tier ?? 'free', auth: supabaseConfigured(), cloudExecution: Boolean(admin), schemaReady, hosted, signedIn: Boolean(data.user),
      environment: Object.fromEntries(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
        'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'MISTRAL_API_KEY', 'NEXT_PUBLIC_POSTHOG_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_PRO_PRICE_ID', 'STRIPE_WEBHOOK_SECRET', 'CRON_SECRET']
        .map(name => [name, Boolean(process.env[name])])) };
  });
}
