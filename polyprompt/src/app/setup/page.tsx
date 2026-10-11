'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppNav } from '@/components/app-nav';
import { fetchJson } from '@/lib/client-api';
interface Setup { auth: boolean; cloudExecution: boolean; schemaReady: boolean; hosted: boolean; environment: Record<string, boolean> }
export default function SetupPage() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { fetchJson<Setup>('/api/setup').then(setSetup).catch(cause => setError(cause.message)); }, []);
  return <div className="min-h-screen bg-gray-50 text-gray-900"><AppNav /><main className="max-w-3xl mx-auto p-4 sm:p-8 space-y-6">
    <h1 className="text-2xl font-bold">Setup status</h1><p className="text-gray-600">Configuration presence is shown below. A configured value still needs a live authentication or provider test.</p>
    {error ? <p role="alert">{error}</p> : !setup ? <p role="status">Checking configuration…</p> : <>
      <section className="bg-white border rounded-lg p-5 space-y-3"><p>Cloud authentication: {setup.auth ? 'Configured' : 'Needs setup'}</p><p>Cloud execution credentials: {setup.cloudExecution ? 'Configured' : 'Needs setup'}</p><p>PolyPrompt schema query: {setup.schemaReady ? 'Ready' : 'Apply the supplied schema, or check cloud access'}</p><p>Hosted provider access: {setup.hosted ? 'Configured' : 'Use your own key'}</p></section>
      <section className="bg-white border rounded-lg p-5"><h2 className="font-semibold mb-3">Environment names and presence</h2><dl className="space-y-2">{Object.entries(setup.environment).map(([name, present]) => <div key={name} className="flex flex-wrap gap-2 justify-between text-sm"><dt className="font-mono break-all">{name}</dt><dd>{present ? 'Present' : 'Absent'}</dd></div>)}</dl></section>
    </>}
    <section className="bg-white border rounded-lg p-5 space-y-3"><h2 className="font-semibold">Operator setup</h2><p className="text-sm text-gray-600">Apply supabase/schema.sql. It creates PolyPrompt-scoped tables and leaves other products’ tables intact. Allow this site’s /auth/callback URL in Supabase. Set provider keys only on the server. Set CRON_SECRET to enable daily 90-day free-run retention cleanup.</p><p className="text-sm text-gray-600">Use the nested polyprompt directory as the Vercel application root. Billing is available only after real Stripe configuration; no paid plan is activated by this page.</p></section>
    <Link href="/runs/new" className="primary-button inline-block">Compare using your own key</Link>
  </main></div>;
}
