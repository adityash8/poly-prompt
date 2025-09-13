import { NextResponse, NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  // Temporarily disable auth middleware until environment variables are configured
  // This allows the app to work without Supabase setup
  console.log("Middleware: Auth disabled - environment setup required");
  return NextResponse.next();
}

export const config = {
  matcher: ["/runs/:path*"],
};
