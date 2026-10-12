// Test-only dependency boundaries. The root, editor, account and storage code are the actual product modules.
import { useEffect, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { RootLayoutClient } from '../../src/components/root-layout-client';
import { ComparisonEditor } from '../../src/components/comparison-editor';
import AccountPage from '../../src/app/account/page';
import RunsPage from '../../src/app/runs/page';
import RunDetailPage from '../../src/app/runs/[id]/page';
import { localHistory, remember, prepareReplay, setOfflineEnabled } from '../../src/lib/local-history';
import type { Comparison } from '../../src/types';

type Listener = (event: AuthChangeEvent, session: Session | null) => void;
const listeners = new Set<Listener>();
let owner: string | null = null;
let automaticInitial = true;
const signOutScopes: string[] = [];
const paths: string[] = [];
let signOutFailure = false;
let mounts = 0;
let unmounts = 0;
const snapshots: { owner: string | null; recoveryPresent: boolean; keyPresent: boolean }[] = [];
const keys = ['poly-prompt-tab-history-v1', 'poly-prompt-replay-v1', 'poly-prompt-offline-history-v1'];

function emit(event: AuthChangeEvent, nextOwner: string | null) {
  owner = nextOwner;
  const session = owner ? { user: { id: owner } } as Session : null;
  for (const listener of [...listeners]) listener(event, session);
}
export function createClient() {
  return { auth: {
    onAuthStateChange(listener: Listener) {
      listeners.add(listener);
      if (automaticInitial) queueMicrotask(() => { if (listeners.has(listener)) listener('INITIAL_SESSION', owner ? { user: { id: owner } } as Session : null); });
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
    async getUser() { return { data: { user: owner ? { id: owner } : null }, error: null }; },
    async signOut(options: { scope: string }) {
      signOutScopes.push(options.scope);
      if (signOutFailure) return { error: new Error('Isolated sign-out failure') };
      emit('SIGNED_OUT', null);
      return { error: null };
    },
  } };
}
export function useRouter() { return { push: (path: string) => paths.push(path), refresh: () => {} }; }
export function usePathname() { return window.location.pathname; }
export function useParams() { return { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }; }
export default function Link({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={href} {...props}>{children}</a>;
}

type View = 'editor' | 'history' | 'detail';
function Screen({ account, view }: { account: boolean; view: View }) {
  const [identity, setIdentity] = useState(owner);
  useEffect(() => {
    mounts++;
    const { data } = createClient().auth.onAuthStateChange((_event, session) => setIdentity(session?.user.id ?? null));
    return () => { unmounts++; data.subscription.unsubscribe(); };
  }, []);
  useLayoutEffect(() => {
    snapshots.push({ owner: identity,
      recoveryPresent: keys.some(key => (key.includes('offline') ? localStorage : sessionStorage).getItem(key) !== null),
      keyPresent: Boolean(document.querySelector<HTMLInputElement>('#key-openrouter')?.value),
    });
  }, [identity]);
  return <><output aria-label="Isolated auth identity">{identity ?? 'guest'}</output>{account ? <AccountPage /> : view === 'history' ? <RunsPage /> : view === 'detail' ? <RunDetailPage /> : <ComparisonEditor />}</>;
}

const root = createRoot(document.getElementById('auth-root')!);
const harness = {
  emit,
  mount: (account = false, view: View = 'editor') => root.render(<RootLayoutClient><Screen account={account} view={view} /></RootLayoutClient>),
  automaticInitial: (enabled: boolean) => { automaticInitial = enabled; },
  recovery: () => localHistory(),
  seedRecovery(comparison: Comparison) { remember(comparison); setOfflineEnabled(true); prepareReplay(comparison.run); },
  status: () => ({ mounts, unmounts, listeners: listeners.size, signOutScopes, paths, snapshots }),
  failSignOut: () => { signOutFailure = true; },
  holdExecution() {
    const fetch = window.fetch.bind(window);
    let release: () => void = () => { throw new Error('No isolated request was submitted'); };
    let signal: AbortSignal | null = null;
    let submitted = false;
    window.fetch = (url, options) => {
      if (url !== '/api/run') return fetch(url, options);
      submitted = true;
      signal = options?.signal ?? null;
      const input = JSON.parse(String(options?.body));
      // Deliberately ignore abort: prove a late transport cannot restore another owner's recovery data.
      return new Promise(resolve => { release = () => resolve(Response.json({ saved: false,
        run: { ...input, credentials: undefined, status: 'completed', resolved_prompt: input.prompt,
          created_at: '2026-10-11T00:00:00Z', updated_at: '2026-10-11T00:00:00Z', is_public: false }, results: [] })); });
    };
    return { submitted: () => submitted, aborted: () => signal?.aborted ?? false, release: () => release() };
  },
};
declare global { interface Window { authHarness: typeof harness; heldExecution: ReturnType<typeof harness.holdExecution> } }
window.authHarness = harness;
