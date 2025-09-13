import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse, NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: runId } = await params;
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if the run belongs to the user
  const { data: run, error: runError } = await supabase
    .from("runs")
    .select("id")
    .eq("id", runId)
    .eq("user_id", session.user.id)
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("evals")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
