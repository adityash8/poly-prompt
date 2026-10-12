'use client';
import { useState } from 'react';
import type { Eval } from '@/types';
import { useToast } from '@/hooks/use-toast';

export function ComparisonResults({ results, onRetry, busy = false }: { results: Eval[]; onRetry?: (model: string) => void; busy?: boolean }) {
  const { toast } = useToast();
  const [highlight, setHighlight] = useState(false);
  const [baselineId, setBaselineId] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);
  const baseline = results.find(result => result.model === baselineId && !result.error) ?? results.find(result => !result.error);
  const lines = new Set(baseline?.output.split('\n').map(line => line.trim()));
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast({ title: 'Copied output', variant: 'success' }); }
    catch { toast({ title: 'Copy failed. Select the output and copy it manually.', variant: 'destructive' }); }
  }
  if (!results.length) return null;
  return <section aria-label="Model comparison results" className="space-y-4">
    <div className="results-toolbar">
      <h2 className="text-xl font-semibold mr-auto">Results</h2>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={highlight} onChange={event => setHighlight(event.target.checked)} />Diff: highlight lines absent from baseline</label>
      {highlight && <select aria-label="Diff baseline" value={baseline?.model ?? ''} onChange={event => setBaselineId(event.target.value)} className="field baseline-select text-sm">
        {results.filter(result => !result.error).map(result => <option key={result.model} value={result.model}>{result.model}</option>)}
      </select>}
    </div>
    <div className="results-grid">
      {results.map(result => <article key={result.model} aria-label={`Result from ${result.model}`} className="result-panel min-w-0">
        <header className="border-b p-4 space-y-2">
          <div className="flex items-start gap-2"><h3 className="font-semibold text-sm break-words min-w-0 flex-1">{result.model}</h3>
            <button disabled={Boolean(result.error)} onClick={() => copy(result.output)} className="text-sm text-link disabled:opacity-40 shrink-0">Copy</button></div>
          <p className="text-xs text-muted-foreground">{result.provider} · {(result.latency_ms / 1000).toFixed(2)} s</p>
          <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Tokens, cost and receipt</summary>
            <dl className="receipt-grid">
              <dt>Input tokens</dt><dd>{result.tokens_in ?? 'Not reported'}</dd>
              <dt>Output tokens</dt><dd>{result.tokens_out ?? 'Not reported'}</dd>
              <dt>Cost (USD)</dt><dd>{result.cost_usd === null ? 'Not reported' : `$${Number(result.cost_usd).toFixed(6)} (${result.cost_source})`}</dd>
              <dt>Actual model</dt><dd className="break-all">{result.actual_model ?? 'Not reported'}</dd>
              <dt>Finish reason</dt><dd>{result.finish_reason ?? 'Not reported'}</dd>
              <dt>Seed passed</dt><dd>{result.seed_applied ? 'Yes; determinism is provider dependent' : 'No'}</dd>
            </dl>{result.generation_id && <p className="break-all mt-2">Receipt: {result.generation_id}</p>}
          </details>
        </header>
        <div className="p-4">
          {result.error ? <div className="text-error bg-error-surface rounded-lg p-3 text-sm" role="status"><p>{result.error}</p>
            {onRetry && <button disabled={busy} onClick={() => onRetry(result.model)} className="mt-3 underline disabled:opacity-50">Retry this model</button>}
          </div> : <>
            <pre className={`result-output font-sans text-sm whitespace-pre-wrap break-words leading-relaxed ${expanded.includes(result.model) ? '' : 'max-h-96 overflow-auto'}`}>
              {highlight && baseline?.model !== result.model ? result.output.split('\n').map((line, index) => <span key={index} className={!lines.has(line.trim()) ? 'bg-yellow-100' : ''}>{line}{index < result.output.split('\n').length - 1 ? '\n' : ''}</span>) : result.output}
            </pre>
            {result.output.length > 1500 && <button className="text-sm text-link mt-3" onClick={() => setExpanded(current => current.includes(result.model) ? current.filter(id => id !== result.model) : [...current, result.model])}>
              {expanded.includes(result.model) ? 'Collapse output' : 'Expand full output'}</button>}
            {['length', 'max_tokens', 'MAX_TOKENS'].includes(result.finish_reason ?? '') && <p className="text-xs text-warning mt-3">The provider reached the output limit. Replay with a larger token budget to continue.</p>}
          </>}
        </div>
      </article>)}
    </div>
  </section>;
}
