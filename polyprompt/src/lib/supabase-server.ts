import 'server-only';
import { createServerClient as ssrClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { supabaseConfigured } from '@/lib/supabase-config';
import { AppError } from '@/lib/validation';

export async function createServerClient() {
  if (!supabaseConfigured()) return null;
  const jar = await cookies();
  return ssrClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => jar.getAll(), setAll: values => {
      try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* Middleware refreshes cookies in Server Components. */ }
    } },
  });
}

export function createServiceClient() {
  if (!supabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function requireUser() {
  const supabase = await createServerClient();
  if (!supabase) throw new AppError(503, 'Cloud history needs Supabase setup. You can compare using your own provider key and keep runs in this tab.');
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new AppError(401, 'Sign in to access your private cloud history.');
  return { supabase, user };
}
