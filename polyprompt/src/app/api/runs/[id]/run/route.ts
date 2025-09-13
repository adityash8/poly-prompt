import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse, NextRequest } from "next/server";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: runId } = await params;
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get the run
  const { data: run, error: runError } = await supabase
    .from("runs")
    .select("*")
    .eq("id", runId)
    .eq("user_id", session.user.id)
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // Update status to running
  await supabase
    .from("runs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", runId);

  const { prompt, models } = run;

  const modelMap: Record<string, string> = {
    "gpt-4o": "openai/gpt-4o",
    "gpt-4o-mini": "openai/gpt-4o-mini",
    "claude-3-5-sonnet": "anthropic/claude-3-5-sonnet-20240620",
    "claude-3-5-haiku": "anthropic/claude-3-haiku-20240307",
    "gemini-1-5-pro": "google/gemini-pro-1.5",
    "gemini-1-5-flash": "google/gemini-flash-1.5",
    "mistral-large": "mistralai/mistral-large-latest",
    "mistral-medium": "mistralai/mistral-medium",
  };

  // Parallel calls
  const results = await Promise.all(
    models.map(async (model: string) => {
      const apiModel = modelMap[model] || model;
      const startTime = Date.now();
      try {
        const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: apiModel,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const latency = Date.now() - startTime;
        const { choices, usage } = data;
        return {
          model,
          output: choices[0]?.message?.content || "",
          tokens_in: usage?.prompt_tokens || 0,
          tokens_out: usage?.completion_tokens || 0,
          latency_ms: latency,
          cost_usd: estimateCost(model, usage?.total_tokens || 0),
          error: null,
        };
      } catch (error) {
        return {
          model,
          output: null,
          tokens_in: 0,
          tokens_out: 0,
          latency_ms: Date.now() - startTime,
          cost_usd: 0,
          error: (error as Error).message,
        };
      }
    })
  );

  // Insert evals
  const evalsToInsert = results.map((result) => ({
    run_id: runId,
    model: result.model,
    provider: getProvider(result.model), // Implement getProvider if needed
    latency_ms: result.latency_ms,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    cost_usd: result.cost_usd,
    output: result.output,
    error: result.error,
    created_at: new Date().toISOString(),
  }));

  const { error: insertError } = await supabase.from("evals").insert(evalsToInsert);

  if (insertError) {
    await supabase.from("runs").update({ status: "error" }).eq("id", runId);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Update status to completed
  await supabase
    .from("runs")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", runId);

  return NextResponse.json({ results });
}

// Placeholder functions
function estimateCost(model: string, tokens: number): number {
  const rates: Record<string, number> = {
    "gpt-4o": 0.000005,
    "claude-3-5-sonnet": 0.000003,
    // Add more
  };
  return (rates[model] || 0.00001) * tokens;
}

function getProvider(model: string): string {
  if (model.startsWith("gpt-")) return "openai";
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gemini-")) return "google";
  if (model.startsWith("mistral-")) return "mistral";
  return "unknown";
}
