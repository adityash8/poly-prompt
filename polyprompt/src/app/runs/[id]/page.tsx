'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Comparison, Eval, Run } from '@/types';
import { AppNav } from '@/components/app-nav';
import { ComparisonEditor } from '@/components/comparison-editor';
import { fetchJson } from '@/lib/client-api';
import { localHistory } from '@/lib/local-history';

export default function RunDetailPage() {
  const id = String(useParams().id);
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reads = 0;
    const local = localHistory().find(item => item.run.id === id);
    if (local) setData(local);
    async function refresh() {
      try {
        const run = await fetchJson<Run>(`/api/runs/${id}`);
        // Read results after status: completion and its outputs commit in one transaction.
        const results = await fetchJson<Eval[]>(`/api/runs/${id}/evals`);
        if (cancelled) return;
        // Keep recoverable local outputs when cloud persistence failed and its row is still running.
        if (!local || run.status !== 'running') setData({ run, results, saved: true });
        if (run.status === 'running' && ++reads < 30) timer = setTimeout(refresh, 2000);
        else if (run.status === 'running') setError('This run is still reserved. Export any recovered outputs and inspect history before replaying; provider charges may apply.');
      } catch (cause) { if (!cancelled && !local) setError((cause as Error).message); }
    }
    if (!local || local.run.user_id) refresh();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id]);
  return <div className="min-h-screen bg-gray-50 text-gray-900"><AppNav /><main className="max-w-7xl mx-auto p-4 sm:p-8">
    <h1 className="text-2xl font-bold mb-6">Saved comparison</h1>
    {data ? <><ComparisonEditor key={`${id}:${data.run.status}:${data.run.updated_at}`} initialComparison={data} />{error && <p role="alert" className="mt-4 text-red-800">{error}</p>}</> : error ? <div role="alert" className="bg-white border rounded-lg p-6"><p>{error}</p><Link href="/runs" className="text-blue-700 underline mt-3 inline-block">Back to history</Link></div> : <p role="status">Loading your comparison…</p>}
  </main></div>;
}
