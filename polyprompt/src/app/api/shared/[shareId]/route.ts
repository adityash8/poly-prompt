import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse, NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  try {
    const { shareId } = await params;
    const supabase = createRouteHandlerClient({ cookies });

    // Get the shared run (no auth required for public shares)
    const { data: run, error: runError } = await supabase
      .from("runs")
      .select("*")
      .eq("share_id", shareId)
      .eq("is_public", true)
      .single();

    if (runError || !run) {
      return NextResponse.json({ error: "Shared run not found" }, { status: 404 });
    }

    // Get the evals for this run
    const { data: evals, error: evalsError } = await supabase
      .from("evals")
      .select("*")
      .eq("run_id", run.id)
      .order("created_at", { ascending: true });

    if (evalsError) {
      return NextResponse.json({ error: evalsError.message }, { status: 500 });
    }

    // Get user profile for attribution (only public info)
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", run.user_id)
      .single();

    const response = {
      run: {
        ...run,
        user_name: profile?.full_name || "Anonymous"
      },
      evals: evals || []
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching shared run:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}