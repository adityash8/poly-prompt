'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { AppNav } from '@/components/app-nav';

export default function LoginPage() {
  const router = useRouter();
  const [client] = useState(createClient);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('error')) setError('This sign-in link could not be verified. Request a fresh link from this browser.');
    if (!client) return;
    client.auth.getUser().then(({ data }) => { if (data.user) router.replace('/runs'); });
    const { data: { subscription } } = client.auth.onAuthStateChange(event => { if (event === 'SIGNED_IN') router.replace('/runs'); });
    return () => subscription.unsubscribe();
  }, [client, router]);
  async function signIn(event: React.FormEvent) {
    event.preventDefault(); if (!client || busy) return;
    setBusy(true); setError(''); setMessage('');
    const { error: authError } = await client.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
    setBusy(false);
    if (authError) setError('The sign-in link could not be sent. Check the address, wait if rate limited, or ask the operator to check Supabase email setup.');
    else setMessage('Check your inbox for a sign-in link. Open it in this browser to save runs privately.');
  }
  return <div className="min-h-screen bg-gray-50 text-gray-900"><AppNav /><main className="max-w-lg mx-auto p-4 sm:py-12">
    <section className="bg-white border shadow-sm rounded-lg p-6 space-y-5"><h1 className="text-2xl font-bold">Sign in with email</h1>
      <p className="text-gray-600">Save comparisons to private cloud history. You can run comparisons with your own key before signing in.</p>
      {!client ? <div className="bg-blue-50 p-4 rounded-lg text-sm"><p>Cloud sign-in is not configured yet. You can compare real models now using your own provider key.</p><Link className="text-blue-700 underline mt-3 inline-block" href="/runs/new">Continue to comparison</Link><p className="mt-3">The operator needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, the supplied schema, and an allowed /auth/callback redirect.</p></div> :
        <form onSubmit={signIn} className="space-y-4"><label className="block text-sm">Email<input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="field mt-1" /></label><button className="primary-button w-full" disabled={busy}>{busy ? 'Sending link…' : 'Send sign-in link'}</button></form>}
      {error && <p className="text-sm text-red-800" role="alert">{error}</p>}{message && <p className="text-sm text-blue-800" role="status">{message}</p>}
    </section>
  </main></div>;
}
