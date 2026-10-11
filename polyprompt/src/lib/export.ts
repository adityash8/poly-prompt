import type { Comparison } from '@/types';

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  // Spreadsheet applications execute cells beginning with these characters.
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function exportComparison(comparison: Comparison, format: 'json' | 'csv'): string {
  const run = { ...comparison.run };
  delete run.user_id;
  if (format === 'json') return JSON.stringify({ run, results: comparison.results, exported_at: new Date().toISOString() }, null, 2);
  const fields = ['Prompt', 'Model', 'Actual model', 'Provider', 'Output', 'Input tokens', 'Output tokens', 'Cost USD', 'Cost source', 'Latency ms', 'Error', 'Finish reason', 'Seed applied'];
  return [fields.map(csvCell).join(','), ...comparison.results.map(result => [run.resolved_prompt, result.model,
    result.actual_model, result.provider, result.output, result.tokens_in, result.tokens_out, result.cost_usd,
    result.cost_source, result.latency_ms, result.error, result.finish_reason, result.seed_applied].map(csvCell).join(','))].join('\r\n');
}

export function downloadComparison(comparison: Comparison, format: 'json' | 'csv') {
  const blob = new Blob([exportComparison(comparison, format)], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `poly-prompt-${comparison.run.id}.${format}`;
  link.click(); URL.revokeObjectURL(url);
}
