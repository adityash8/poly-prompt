'use client';
import { Fragment, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { CommandPalette, useCommandPalette } from '@/components/command-palette';
import { createClient } from '@/lib/supabase';
import { Toaster } from '@/components/ui/toaster';
import { reconcileLocalHistory } from '@/lib/local-history';

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useCommandPalette();
  const startedAnalytics = useRef(false);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [authRevision, setAuthRevision] = useState(0);
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => { try { const choice = localStorage.getItem('poly-prompt-analytics-consent-v1'); setConsent(choice === null ? null : choice === 'yes'); } catch { setConsent(false); } }, []);
  useEffect(() => {
    let cancelled = false;
    if (consent === true && process.env.NEXT_PUBLIC_POSTHOG_KEY) import('@/lib/growthos.js').then(({ initGrowthOS }) => {
      if (!cancelled) { initGrowthOS(process.env.NEXT_PUBLIC_POSTHOG_KEY); startedAnalytics.current = true; }
    });
    return () => { cancelled = true; };
  }, [consent]);
  useEffect(() => {
    const client = createClient();
    if (!client) {
      try { reconcileLocalHistory(null); } catch { /* Reads still enforce the guest boundary if storage is restricted. */ }
      setAuthReady(true);
      return;
    }
    let lastActivity = Date.now();
    let signedIn = false;
    let signingOut = false;
    let ownerId: string | null | undefined;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      const nextOwner = session?.user.id ?? null;
      const initial = ownerId === undefined;
      const clear = event === 'SIGNED_OUT' || (ownerId != null && ownerId !== nextOwner);
      let reset = clear;
      try { reset = reconcileLocalHistory(nextOwner, clear); } catch { reset = true; }
      const update = () => {
        if (reset) setAuthRevision(current => current + 1);
        setAuthReady(true);
      };
      if (initial) update();
      else if (reset) {
        // Finish editor teardown before the auth callback returns to other session listeners.
        flushSync(update);
      }
      ownerId = nextOwner;
      signedIn = nextOwner !== null;
      if (event === 'SIGNED_IN') lastActivity = Date.now();
    });
    const activity = () => { lastActivity = Date.now(); };
    const events = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach(event => window.addEventListener(event, activity, { passive: true }));
    const timer = window.setInterval(() => {
      if (signedIn && !signingOut && Date.now() - lastActivity > 3600000) {
        signingOut = true;
        client.auth.signOut({ scope: 'local' }).then(({ error }) => {
          if (!error) window.location.assign('/login');
        }).finally(() => { signingOut = false; });
      }
    }, 60000);
    return () => { subscription.unsubscribe(); window.clearInterval(timer); events.forEach(event => window.removeEventListener(event, activity)); };
  }, []);
  async function choose(value: boolean) {
    try { localStorage.setItem('poly-prompt-analytics-consent-v1', value ? 'yes' : 'no'); } catch { /* Consent still applies for this page. */ }
    setConsent(value);
    if (!value && startedAnalytics.current) { startedAnalytics.current = false; const { stopGrowthOS } = await import('@/lib/growthos.js'); stopGrowthOS(); }
  }
  return <>
    {authReady ? <Fragment key={authRevision}>{children}</Fragment> : <p role="status" className="p-6">Checking your session…</p>}
    <footer className="text-gray-700 bg-white border-t p-4 text-xs flex flex-wrap items-center justify-center gap-3">
      <span>Optional analytics: {consent === true ? 'on' : 'off'}. No prompts, outputs or provider keys are tracked.</span>
      {consent !== true && <button className="text-blue-700 underline" onClick={() => choose(true)}>Allow analytics</button>}
      {consent !== false && <button className="text-blue-700 underline" onClick={() => choose(false)}>{consent === true ? 'Turn analytics off' : 'Decline'}</button>}
      <button className="text-blue-700 underline" onClick={() => setOpen(true)}>Commands (⌘K)</button>
    </footer>
    <CommandPalette open={open} onOpenChange={setOpen} /><Toaster />
  </>;
}
