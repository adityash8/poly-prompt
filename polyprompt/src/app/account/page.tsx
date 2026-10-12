'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppNav } from '@/components/app-nav';
import { fetchJson } from '@/lib/client-api';
import { forget, setOfflineEnabled } from '@/lib/local-history';
import { createClient } from '@/lib/supabase';
interface Account { tier: string; used: number; limit: number | null; billingAvailable: boolean }
export default function AccountPage() {
  const router = useRouter();
  const checkoutAttempt = useRef<string | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { fetchJson<Account>('/api/account').then(setAccount).catch(cause => setError(cause.message)); }, []);
  useEffect(() => { const client = createClient(); if (client) client.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user))); }, []);
  async function clearCloud() {
    if (!window.confirm('Delete all your cloud comparisons, their outputs, and public links? Export a copy first. This cannot be undone.')) return;
    try { await fetchJson('/api/runs', { method: 'DELETE' }); setNotice('Cloud comparisons and their public links were deleted. Minimal monthly quota receipts remain until the next month.'); }
    catch (cause) { setError((cause as Error).message); }
  }
  async function exportCloud() {
    try {
      const response = await fetch('/api/account/export');
      if (!response.ok) throw new Error('Your export could not be created. Please retry.');
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = 'poly-prompt-data.json'; link.click(); URL.revokeObjectURL(url);
    } catch (cause) { setError((cause as Error).message); }
  }
  async function billing(portal = false) {
    setBillingBusy(true); setError('');
    try {
      checkoutAttempt.current ??= crypto.randomUUID();
      const result = await fetchJson<{ url: string }>(`/api/billing/${portal ? 'portal' : 'checkout'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: checkoutAttempt.current }) });
      window.location.assign(result.url);
    } catch (cause) { setError((cause as Error).message); setBillingBusy(false); }
  }
  async function signOut() {
    const client = createClient();
    if (client) { const { error } = await client.auth.signOut({ scope: 'local' }); if (error) { setError('Sign-out failed. Please retry.'); return; } }
    router.push('/'); router.refresh();
  }
  return <div className="app-shell"><AppNav /><main className="workspace-main settings-main space-y-6">
    <h1 className="page-title">Account and privacy</h1>
    {error && <p className="text-sm text-error bg-error-surface rounded-lg p-4" role="alert">{error} <Link className="underline" href="/login">Sign in</Link></p>}
    {notice && <p className="text-sm text-info" role="status">{notice}</p>}
    {account && <section className="surface-panel border rounded-lg p-5 space-y-3"><h2 className="font-semibold">{account.tier} account</h2><p className="text-sm">Hosted executions this calendar month: {account.used}{account.limit === null ? '' : ` / ${account.limit}`}. A failed-model retry shares the original quota receipt. Comparisons using your own key do not spend hosted quota.</p><p className="text-sm text-muted-foreground">{account.billingAvailable ? 'Manage subscriptions and invoices through Stripe. Entitlements change only after a verified webhook.' : 'Paid upgrades need Stripe provisioning. No checkout is available yet.'}</p>{account.billingAvailable && <button className="primary-button" disabled={billingBusy} onClick={() => billing(account.tier !== 'free')}>{billingBusy ? 'Opening Stripe…' : account.tier === 'free' ? 'Upgrade through Stripe' : 'Manage billing and invoices'}</button>}
      </section>}
    {signedIn && <button className="secondary-button" onClick={signOut}>Sign out</button>}
    <section className="surface-panel border rounded-lg p-5 space-y-4"><h2 className="font-semibold">Your comparison data</h2><p className="text-sm text-muted-foreground">Guest results stay in this browser tab. If you opt in, the last five are also kept on this device. Provider keys are kept only in memory. Free cloud runs are retained for 90 days; shared links expire after 30 days and can be revoked.</p>
      <p className="text-sm text-muted-foreground">Your cloud export includes comparisons, personal templates, profile fields, and retained quota receipts. Delete personal templates from the gallery. Account and profile deletion is handled by the site operator because sign-in may be shared with other products.</p>
      <div className="flex flex-wrap gap-3"><button className="secondary-button" disabled={!account} onClick={exportCloud}>Export cloud data</button><button className="secondary-button destructive-button" disabled={!account} onClick={clearCloud}>Delete all cloud comparisons</button>
        <button className="secondary-button destructive-button" onClick={() => {
          try { forget(); setOfflineEnabled(false); setNotice('Tab history and the offline result cache were erased.'); }
          catch { setError('Browser storage could not be cleared. Clear this site’s storage in your browser settings.'); }
        }}>Clear device history</button></div>
    </section>
    <section className="surface-panel border rounded-lg p-5 space-y-3"><h2 className="font-semibold">Tracking consent</h2><p className="text-sm text-muted-foreground">Optional analytics are off until you opt in. Use the privacy controls below to change that choice. Prompts, outputs, provider keys, and email addresses are excluded from analytics.</p></section>
  </main></div>;
}
