import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse, NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: runId } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

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

    // Get the evals
    const { data: evals, error: evalsError } = await supabase
      .from("evals")
      .select("*")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });

    if (evalsError) {
      return NextResponse.json({ error: evalsError.message }, { status: 500 });
    }

    const exportData = {
      run: {
        id: run.id,
        title: run.title,
        prompt: run.prompt,
        status: run.status,
        models: run.models,
        variables: run.variables,
        created_at: run.created_at,
        updated_at: run.updated_at
      },
      results: evals?.map(result => ({
        model: result.model,
        provider: result.provider,
        latency_ms: result.latency_ms,
        tokens_in: result.tokens_in,
        tokens_out: result.tokens_out,
        cost_usd: result.cost_usd,
        output: result.output,
        error: result.error,
        created_at: result.created_at
      })) || [],
      exported_at: new Date().toISOString(),
      export_format: format
    };

    if (format === 'csv') {
      // Convert to CSV
      const csvHeaders = [
        'Model',
        'Provider',
        'Latency (ms)',
        'Tokens In',
        'Tokens Out',
        'Total Tokens',
        'Cost (USD)',
        'Output',
        'Error'
      ];

      const csvRows = exportData.results.map(result => [
        result.model,
        result.provider,
        result.latency_ms,
        result.tokens_in,
        result.tokens_out,
        result.tokens_in + result.tokens_out,
        result.cost_usd,
        `"${(result.output || '').replace(/"/g, '""')}"`, // Escape quotes
        result.error || ''
      ]);

      const csvContent = [
        `# ${run.title}`,
        `# Prompt: ${run.prompt.replace(/\n/g, ' ')}`,
        `# Exported: ${new Date().toISOString()}`,
        '',
        csvHeaders.join(','),
        ...csvRows.map(row => row.join(','))
      ].join('\n');

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="poly-prompt-${run.title.replace(/[^a-zA-Z0-9]/g, '-')}.csv"`
        }
      });
    } else {
      // Return JSON
      return new NextResponse(JSON.stringify(exportData, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="poly-prompt-${run.title.replace(/[^a-zA-Z0-9]/g, '-')}.json"`
        }
      });
    }
  } catch (error) {
    console.error("Error exporting run:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}