'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Comparison, Eval, Run } from '@/types';
import { AppNav } from '@/components/app-nav';
import { ComparisonResults } from '@/components/comparison-results';
import { fetchJson } from '@/lib/client-api';
import { downloadComparison } from '@/lib/export';
import { prepareReplay } from '@/lib/local-history';

export default function SharedRunPage() {
  const shareId = String(useParams().shareId);
  const router = useRouter();
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetchJson<{ run: Run; evals: Eval[] }>(`/api/shared/${shareId}`).then(result => {
      if (!cancelled) setData({ run: result.run, results: result.evals, saved: false });
    }).catch(cause => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; };
  }, [shareId]);
  return <div className="min-h-screen bg-gray-50 text-gray-900"><AppNav /><main className="max-w-7xl mx-auto p-4 sm:p-8 space-y-6">
    <h1 className="text-2xl font-bold">Shared comparison</h1>
    <p className="text-sm text-gray-600">Read-only public results. You can export a copy or start a new comparison.</p>
    {error ? <p role="alert" className="bg-white border rounded-lg p-6">{error}</p> : !data ? <p role="status">Loading shared results…</p> : <>
      <section className="bg-white border rounded-lg p-5 space-y-4"><h2 className="font-semibold">{data.run.title}</h2><pre className="font-sans text-sm whitespace-pre-wrap break-words">{data.run.resolved_prompt || data.run.prompt}</pre>
        {data.run.share_expires_at && <p className="text-xs text-gray-500">Expires {new Date(data.run.share_expires_at).toLocaleDateString()}</p>}
        <div className="flex flex-wrap gap-3"><button className="secondary-button" onClick={() => downloadComparison(data, 'json')}>Export JSON</button><button className="secondary-button" onClick={() => downloadComparison(data, 'csv')}>Export CSV</button>
          <button className="primary-button" onClick={() => { prepareReplay(data.run); router.push('/runs/new'); }}>Try this prompt</button></div>
      </section><ComparisonResults results={data.results} />
    </>}
  </main></div>;
}
