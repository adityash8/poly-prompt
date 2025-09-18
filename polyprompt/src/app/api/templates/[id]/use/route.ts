import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse, NextRequest } from "next/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: templateId } = await params;
    const supabase = createRouteHandlerClient({ cookies });

    // Increment use count
    const { error } = await supabase
      .from("templates")
      .update({
        use_count: supabase.rpc('increment_use_count', { template_id: templateId })
      })
      .eq("id", templateId);

    if (error) {
      // If RPC doesn't exist, use a simple increment
      const { data: template } = await supabase
        .from("templates")
        .select("use_count")
        .eq("id", templateId)
        .single();

      if (template) {
        await supabase
          .from("templates")
          .update({ use_count: template.use_count + 1 })
          .eq("id", templateId);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error incrementing template use count:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}