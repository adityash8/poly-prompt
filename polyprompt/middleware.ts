import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse, NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  try {
    // Check if Supabase environment variables are available
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.warn("Supabase environment variables not configured, skipping auth middleware");
      return NextResponse.next();
    }

    const res = NextResponse.next();
    const supabase = createMiddlewareClient({ req, res });
    const { data: { session } } = await supabase.auth.getSession();

    if (!session && req.nextUrl.pathname.startsWith("/runs")) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    return res;
  } catch (error) {
    console.error("Middleware error:", error);
    // If middleware fails, allow the request to continue
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/runs/:path*"],
};
