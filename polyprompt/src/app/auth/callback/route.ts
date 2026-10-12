import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requestOrigin } from '@/lib/http';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const supabase = await createServerClient();
  if (supabase && code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL('/runs', requestOrigin(request)));
  }
  return NextResponse.redirect(new URL('/login?error=callback', requestOrigin(request)));
}
