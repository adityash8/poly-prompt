import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfigured } from './src/lib/supabase-config';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!supabaseConfigured()) return response;
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => request.cookies.getAll(), setAll: values => {
      values.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    } },
  });
  await supabase.auth.getUser();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/runs/:path*', '/account', '/api/:path*', '/auth/:path*'] };
