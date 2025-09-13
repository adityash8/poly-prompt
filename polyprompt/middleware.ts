import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse, NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session && req.nextUrl.pathname.startsWith("/runs")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/runs/:path*"],
};
