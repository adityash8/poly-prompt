'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Comparison, Run } from '@/types';
import { AppNav } from '@/components/app-nav';
import { fetchJson } from '@/lib/client-api';
import { forget, localHistory } from '@/lib/local-history';

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [local, setLocal] = useState<Comparison[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLocal(localHistory()); setLoading(true);
    fetchJson<{ runs: Run[]; total: number }>(`/api/runs?page=${page}`).then(data => {
      if (!cancelled) { setRuns(data.runs); setTotal(data.total); setMessage('Cloud history. Free runs expire after 90 days. Each page lists up to 50 runs.'); }
    }).catch(cause => { if (!cancelled) { setRuns([]); setMessage(cause.message + ' Runs saved in this tab are shown below.'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page]);
  const combined = [...runs, ...local.map(item => item.run)].filter((run, index, rows) => rows.findIndex(item => item.id === run.id) === index);
  const filtered = combined.filter(run => `${run.title} ${run.prompt}`.toLowerCase().includes(search.toLowerCase()) &&
    (status === 'all' || run.status === status) && (!date || run.created_at.slice(0, 10) === date));
  async function remove(run: Run) {
    if (!window.confirm('Delete this comparison and revoke its public link? This cannot be undone.')) return;
    try {
      if (runs.some(item => item.id === run.id) || run.user_id) {
        await fetchJson(`/api/runs/${run.id}`, { method: 'DELETE' }); setRuns(current => current.filter(item => item.id !== run.id));
      }
      if (local.some(item => item.run.id === run.id)) { forget(run.id); setLocal(localHistory()); }
    } catch (cause) { setMessage((cause as Error).message); }
  }
  return <div className="min-h-screen bg-gray-50 text-gray-900"><AppNav /><main className="max-w-7xl mx-auto p-4 sm:p-8 space-y-6">
    <header className="flex flex-wrap items-center gap-4"><h1 className="text-2xl font-bold mr-auto">Run history</h1><Link href="/runs/new" className="primary-button">New comparison</Link></header>
    <p className="text-sm text-gray-600" role="status">{message}</p>
    <div className="flex flex-wrap gap-3">
      <input aria-label="Search history page" placeholder="Search this page by title or prompt" value={search} onChange={event => setSearch(event.target.value)} className="field sm:flex-1 sm:w-auto" />
      <select aria-label="Filter run status" value={status} onChange={event => setStatus(event.target.value)} className="field sm:w-auto"><option value="all">All statuses</option>{['draft', 'running', 'completed', 'error'].map(value => <option key={value}>{value}</option>)}</select>
      <input type="date" aria-label="Filter run date" value={date} onChange={event => setDate(event.target.value)} className="field sm:w-auto" />
    </div>
    {loading ? <p role="status">Loading private history…</p> : filtered.length ? <div className="space-y-3">{filtered.map(run => <article key={run.id} className="bg-white border rounded-lg p-5 flex items-start gap-4">
      <Link href={`/runs/${run.id}`} className="flex-1 min-w-0"><h2 className="font-semibold break-words">{run.title}</h2><p className="text-sm text-gray-500 mt-1">{run.status} · {new Date(run.created_at).toLocaleString()} · {run.models.length} models · {local.some(item => item.run.id === run.id) ? 'In this tab' : 'Cloud'}</p><p className="text-sm text-gray-600 line-clamp-2 mt-3 break-words">{run.prompt}</p></Link>
      <button className="text-sm text-red-700 shrink-0" onClick={() => remove(run)}>Delete</button>
    </article>)}</div> : <div className="bg-white border rounded-lg p-8"><h2 className="font-semibold">No comparisons match this view.</h2><p className="text-gray-600 mt-2">Run a prompt to start a history, or change your filters.</p></div>}
    {total > 50 && <div className="flex items-center gap-4"><button className="secondary-button" disabled={page === 0} onClick={() => setPage(current => current - 1)}>Previous</button><span className="text-sm">Page {page + 1} of {Math.ceil(total / 50)}</span><button className="secondary-button" disabled={(page + 1) * 50 >= total} onClick={() => setPage(current => current + 1)}>Next</button></div>}
    <Link className="text-sm text-blue-700 underline inline-block" href="/account">Export all cloud comparisons or clear your data</Link>
  </main></div>;
}
