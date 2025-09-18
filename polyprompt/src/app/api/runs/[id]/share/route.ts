import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse, NextRequest } from "next/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: runId } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Generate a unique share ID
    const shareId = Math.random().toString(36).substring(2, 10);

    // Update the run to be public and add share ID
    const { data, error } = await supabase
      .from("runs")
      .update({
        is_public: true,
        share_id: shareId,
        updated_at: new Date().toISOString()
      })
      .eq("id", runId)
      .eq("user_id", session.user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const shareUrl = `${request.nextUrl.origin}/shared/${shareId}`;

    return NextResponse.json({ shareId, shareUrl, run: data });
  } catch (error) {
    console.error("Error creating share link:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: runId } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Remove sharing (make private and remove share ID)
    const { data, error } = await supabase
      .from("runs")
      .update({
        is_public: false,
        share_id: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", runId)
      .eq("user_id", session.user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ run: data });
  } catch (error) {
    console.error("Error removing share link:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}