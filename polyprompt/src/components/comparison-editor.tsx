'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Comparison, Credentials, ModelConfig, RunInput } from '@/types';
import { variableNames, resolvePrompt, validateInput } from '@/lib/validation';
import { STARTER_TEMPLATES } from '@/lib/templates';
import { fetchJson } from '@/lib/client-api';
import { downloadComparison } from '@/lib/export';
import { remember, takeReplay, offlineEnabled, setOfflineEnabled, prepareReplay } from '@/lib/local-history';
import { CredentialFields } from '@/components/credential-fields';
import { ComparisonResults } from '@/components/comparison-results';

interface Setup { tier?: string; signedIn: boolean; hosted: boolean; auth: boolean; cloudExecution: boolean; schemaReady: boolean }
const empty: RunInput = { title: '', prompt: 'Explain when a small team should use a smaller AI model instead of a larger one. Give a concrete example in under 150 words.', variables: {}, models: [], seed: null, max_output_tokens: 1000 };

export function ComparisonEditor({ initialComparison, templateId }: { initialComparison?: Comparison; templateId?: string }) {
  const router = useRouter();
  const [input, setInput] = useState<RunInput>(initialComparison?.run ?? empty);
  const [comparison, setComparison] = useState<Comparison | null>(initialComparison ?? null);
  const [catalog, setCatalog] = useState<ModelConfig[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [setup, setSetup] = useState<Setup | null>(null);
  const [credentials, setCredentials] = useState<Credentials>({});
  const [hosted, setHosted] = useState(false);
  const [cloudSave, setCloudSave] = useState(true);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [offline, setOffline] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(initialComparison?.run.share_id ? `/shared/${initialComparison.run.share_id}` : null);
  const [shareBusy, setShareBusy] = useState(false);
  const lock = useRef(false);
  const attempt = useRef<{ signature: string; id: string; request_id: string } | null>(null);
  const active = useRef(true);
  const execution = useRef<AbortController | null>(null);

  async function refreshCatalog() {
    setCatalogError('');
    try {
      const models = await fetchJson<ModelConfig[]>('/api/models');
      setCatalog(models);
      setInput(current => current.models.length ? current : { ...current, models: ['openai/gpt-4o-mini', 'google/gemini-2.5-flash']
        .filter(id => models.some(model => model.id === id)) });
    } catch (cause) { setCatalogError(cause instanceof Error ? cause.message : 'Model catalog unavailable.'); }
  }

  useEffect(() => {
    active.current = true;
    refreshCatalog();
    fetchJson<Setup>('/api/setup').then(setSetup).catch(() => setSetup({ signedIn: false, hosted: false, auth: false, cloudExecution: false, schemaReady: false }));
    setOffline(offlineEnabled());
    if (!initialComparison) {
      const replay = takeReplay();
      const template = STARTER_TEMPLATES.find(item => item.id === templateId);
      if (replay) setInput(replay);
      else if (template) setInput(current => ({ ...current, title: template.title, prompt: template.prompt, variables: template.variables }));
    }
    const clear = () => { setCredentials({}); attempt.current = null; };
    window.addEventListener('pagehide', clear);
    return () => { active.current = false; execution.current?.abort(); attempt.current = null; window.removeEventListener('pagehide', clear); };
  // Initial input is consumed once. Catalog refresh preserves subsequent edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const names = variableNames(input.prompt);
  const limit = hosted && setup?.tier === 'free' ? 2 : 10;
  const preferred = new Set(['openai/gpt-4o-mini', 'openai/gpt-4o', 'anthropic/claude-sonnet-4.6', 'google/gemini-2.5-flash', 'mistralai/mistral-small-2603', 'meta-llama/llama-3.3-70b-instruct']);
  const visible = catalog.filter(model => input.models.includes(model.id) || (search ? `${model.name} ${model.id}`.toLowerCase().includes(search.toLowerCase()) : preferred.has(model.id)));
  function update<K extends keyof RunInput>(key: K, value: RunInput[K]) { setInput(current => ({ ...current, [key]: value })); }
  function toggle(id: string) {
    if (!input.models.includes(id) && input.models.length >= limit) { setError(`Select at most ${limit} models in this mode.`); return; }
    update('models', input.models.includes(id) ? input.models.filter(model => model !== id) : [...input.models, id]);
    setError('');
  }

  async function execute(retryModel?: string) {
    if (lock.current) return;
    setError(''); setNotice('');
    const source = retryModel && comparison ? comparison.run : input;
    try { resolvePrompt(source.prompt, source.variables); } catch (cause) { setError((cause as Error).message); return; }
    if (!source.models.length) { setError('Select at least one model.'); return; }
    if (!hosted && !Object.values(credentials).some(Boolean)) { setError('Add your OpenRouter key or native provider keys to run a real comparison.'); return; }
    lock.current = true; setBusy(true);
    const request = new AbortController();
    execution.current = request;
    try {
      let next: Comparison;
      const submitted = validateInput({ ...source, models: retryModel ? [retryModel] : source.models });
      const signature = JSON.stringify({ submitted, credentials, hosted, cloudSave, retry: retryModel ? comparison?.run.id : null });
      if (!attempt.current || attempt.current.signature !== signature) attempt.current = { signature, id: crypto.randomUUID(), request_id: crypto.randomUUID() };
      if (retryModel && comparison?.saved) {
        next = await fetchJson<Comparison>(`/api/runs/${comparison.run.id}/run`, { method: 'POST', signal: request.signal, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_id: attempt.current.request_id, retry_models: [retryModel], credentials, use_hosted: hosted }) });
      } else {
        const savedDraft = comparison?.saved && comparison.run.status === 'draft' &&
          JSON.stringify(validateInput(comparison.run)) === JSON.stringify(submitted);
        next = await fetchJson<Comparison>('/api/run', { method: 'POST', signal: request.signal, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...submitted, id: savedDraft ? comparison.run.id : attempt.current.id, request_id: attempt.current.request_id,
            credentials, use_hosted: hosted, save: !retryModel && cloudSave && Boolean(setup?.schemaReady) }) });
        if (retryModel && comparison && !comparison.saved) next = { ...comparison, run: { ...comparison.run,
          status: [...comparison.results.filter(result => result.model !== retryModel), ...next.results].some(result => !result.error) ? 'completed' : 'error' },
          results: [...comparison.results.filter(result => result.model !== retryModel), ...next.results] };
      }
      if (!active.current) return;
      attempt.current = null; setComparison(next); setShareUrl(next.run.share_id ? `/shared/${next.run.share_id}` : null);
      let storageFailed = false;
      try { remember(next); } catch { storageFailed = true; }
      if (storageFailed) setNotice('Browser storage is unavailable. Export your results before leaving this page.' + (next.warning ? ` ${next.warning}` : ''));
      else if (next.warning) setNotice(next.warning);
      else setNotice(next.saved ? 'Saved to your private cloud history.' : 'Kept in this tab. Export to keep a copy, or sign in after cloud setup for private history.');
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : 'Comparison failed.'); }
    finally { lock.current = false; execution.current = null; if (active.current) setBusy(false); }
  }

  async function saveDraft() {
    setError('');
    try {
      const submitted = validateInput(input);
      if (setup?.signedIn && setup.schemaReady && cloudSave) {
        const run = await fetchJson<Comparison['run']>('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submitted) });
        router.push(`/runs/${run.id}`);
      } else {
        const now = new Date().toISOString();
        const draft: Comparison = { run: { ...submitted, id: crypto.randomUUID(), created_at: now, updated_at: now,
          resolved_prompt: resolvePrompt(submitted.prompt, submitted.variables), status: 'draft', is_public: false }, results: [], saved: false };
        remember(draft); setNotice('Draft saved in this tab.');
      }
    } catch (cause) { setError((cause as Error).message); }
  }

  async function share(revoke = false) {
    if (!comparison?.saved || shareBusy) return;
    if (!revoke && !window.confirm('Anyone with this link can read the prompt, variables, and all outputs. Publish this comparison?')) return;
    setShareBusy(true); setError('');
    try {
      const result = await fetchJson<{ shareUrl: string | null; expiresAt: string | null }>(`/api/runs/${comparison.run.id}/share`, { method: revoke ? 'DELETE' : 'POST' });
      setShareUrl(result.shareUrl);
      setNotice(revoke ? 'Share link revoked.' : result.expiresAt ? `Share link expires ${new Date(result.expiresAt).toLocaleDateString()}.` : 'Read-only share link created.');
    } catch (cause) { setError((cause as Error).message); }
    finally { setShareBusy(false); }
  }

  return <div className="space-y-6">
    <section className="bg-white rounded-lg border shadow-sm p-4 sm:p-6 space-y-5" aria-label="Comparison editor">
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-semibold mr-auto">{initialComparison ? 'Review or replay this run' : 'Compare one prompt'}</h2>
        <label className="text-sm">Starter template <select aria-label="Starter template" className="border rounded-lg p-2 ml-2 max-w-full" defaultValue="" onChange={event => {
          const template = STARTER_TEMPLATES.find(item => item.id === event.target.value);
          if (template) setInput(current => ({ ...current, title: template.title, prompt: template.prompt, variables: template.variables }));
        }}><option value="">Choose a prompt</option>{STARTER_TEMPLATES.map(template => <option key={template.id} value={template.id}>{template.title}</option>)}</select></label>
      </div>
      <label className="block text-sm font-medium">Title (optional)<input aria-label="Run title" className="field mt-1" maxLength={120} value={input.title} onChange={event => update('title', event.target.value)} /></label>
      <label htmlFor="prompt" className="block text-sm font-medium">Prompt</label>
      <textarea id="prompt" rows={6} maxLength={4000} value={input.prompt} onChange={event => update('prompt', event.target.value)} className="field resize-y" />
      <p className="text-xs text-gray-500">{input.prompt.length}/4,000 characters. Use {'{{variable}}'} to change values between runs. Variable values count toward the limit.</p>
      {names.length > 0 && <fieldset className="grid sm:grid-cols-2 gap-3"><legend className="text-sm font-medium mb-2">Variables</legend>
        {names.map(name => <label key={name} className="text-sm">{name}<input aria-label={`Variable ${name}`} value={input.variables[name] ?? ''} onChange={event => update('variables', { ...input.variables, [name]: event.target.value })} className="field mt-1" /></label>)}
      </fieldset>}
      {setup?.hosted && <label className="flex gap-2 text-sm items-center"><input type="checkbox" checked={hosted} disabled={busy || !setup.signedIn} onChange={event => { setHosted(event.target.checked); if (event.target.checked) setCloudSave(true); setError(''); }} />Use configured hosted access (sign-in required, free tier: 50 runs/month, two models)</label>}
      {!hosted && <CredentialFields credentials={credentials} onChange={next => { setCredentials(next); attempt.current = null; }} disabled={busy} />}
      {setup?.signedIn && <div className="text-sm space-y-2"><label className="flex items-center gap-2"><input type="checkbox" checked={cloudSave && setup.schemaReady}
        disabled={busy || hosted || !setup.schemaReady} onChange={event => setCloudSave(event.target.checked)} />Save to private cloud history</label>
        {!setup.schemaReady && <p className="text-amber-800">Cloud history needs the PolyPrompt schema. BYO comparisons can still run in this tab. <Link href="/setup" className="underline">View setup</Link></p>}</div>}
      <p className="text-xs text-gray-500">Prompts go to the providers you select. OpenRouter requests opt out of provider data collection; native requests follow that provider’s policy. Provider usage may incur charges on your key.</p>
      <fieldset disabled={busy} className="space-y-3"><legend className="font-medium">Models ({input.models.length}/{limit} selected)</legend>
        <input aria-label="Search live model catalog" type="search" placeholder="Search the live catalog by provider or model" value={search} onChange={event => setSearch(event.target.value)} className="field" />
        {catalogError ? <p className="text-red-800 text-sm" role="alert">{catalogError} <button className="underline" onClick={refreshCatalog}>Refresh catalog</button></p> : !catalog.length ? <p role="status" className="text-sm text-gray-500">Loading the live model catalog…</p> :
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-80 overflow-auto p-1">
            {visible.map(model => <label key={model.id} className={`p-3 border rounded-lg cursor-pointer flex items-start gap-2 min-w-0 ${input.models.includes(model.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
              <input type="checkbox" checked={input.models.includes(model.id)} onChange={() => toggle(model.id)} className="mt-1" />
              <span className="min-w-0"><span className="block text-sm font-medium break-words">{model.name}</span><span className="block text-xs text-gray-500 break-all">{model.id}</span>
                <span className="block text-xs text-gray-500 mt-1">{model.input_price === null || model.output_price === null ? 'Price not reported' : `$${(model.input_price * 1000000).toFixed(2)} in / $${(model.output_price * 1000000).toFixed(2)} out per 1M tokens`}</span>
              </span></label>)}
            {!visible.length && <p className="text-sm text-gray-500">No matching models.</p>}
          </div>}
        <div className="flex flex-wrap gap-2">{input.models.filter(id => !catalog.some(model => model.id === id)).map(id => <button key={id} type="button" onClick={() => toggle(id)} className="text-sm text-red-800 border rounded-lg p-2">Remove unavailable model: {id}</button>)}</div>
      </fieldset>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="text-sm">Output tokens per model<input aria-label="Output tokens per model" type="number" min={1} max={Math.floor(10000 / Math.max(input.models.length, 1))} value={input.max_output_tokens} onChange={event => update('max_output_tokens', Number(event.target.value))} className="field mt-1" /></label>
        <label className="text-sm">Seed (optional)<input aria-label="Seed" type="number" min={0} max={2147483647} value={input.seed ?? ''} onChange={event => update('seed', event.target.value === '' ? null : Number(event.target.value))} className="field mt-1" /></label>
      </div>
      <p className="text-xs text-gray-500">At most 10,000 output tokens across models. Seeds are passed only to supported models; they do not guarantee identical output. Each model has a 15-second deadline.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={offline} onChange={event => {
        try { setOfflineEnabled(event.target.checked); setOffline(event.target.checked); }
        catch { setError('This browser does not allow local storage. Export results instead.'); }
      }} /><span>Keep the last five guest runs on this device for offline access. This stores prompts and outputs, never provider keys. Turn off to erase that cache.</span></label>
      <div className="flex flex-wrap gap-3 items-center">
        <button disabled={busy || !catalog.length || !input.prompt.trim() || !input.models.length} onClick={() => execute()} className="primary-button">{busy ? 'Running selected models…' : initialComparison?.run.status === 'draft' ? 'Execute draft' : initialComparison ? 'Replay as new run' : 'Run comparison'}</button>
        <button disabled={busy} onClick={saveDraft} className="secondary-button">{setup?.signedIn && setup.schemaReady && cloudSave ? 'Save draft to cloud' : 'Save draft in tab'}</button>
        {setup?.signedIn && setup.schemaReady && <button disabled={busy} className="secondary-button" onClick={async () => {
          try { await fetchJson('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: input.title || input.prompt.slice(0, 60), prompt: input.prompt, variables: input.variables }) }); setNotice('Saved as a personal template.'); } catch (cause) { setError((cause as Error).message); }
        }}>Save personal template</button>}
        {!setup?.signedIn && <Link href="/login" className="text-sm text-blue-700">Sign in for private cloud history</Link>}
      </div>
      {busy && <p className="text-sm text-blue-800" role="status">Requests run in parallel. Results include partial failures after the 15-second per-model deadline.</p>}
      {error && <p className="text-sm text-red-800 bg-red-50 p-3 rounded-lg" role="alert">{error}</p>}
      {notice && <p className="text-sm text-blue-800 bg-blue-50 p-3 rounded-lg" role="status">{notice}</p>}
    </section>
    {comparison && <>
      <section className="bg-white rounded-lg border p-4 space-y-3" aria-label="Completed run actions">
        <div className="flex flex-wrap items-center gap-3"><h2 className="font-semibold mr-auto">{comparison.run.title}</h2>
          <button className="secondary-button" onClick={() => downloadComparison(comparison, 'json')}>Export JSON</button>
          <button className="secondary-button" onClick={() => downloadComparison(comparison, 'csv')}>Export CSV</button>
          <button className="secondary-button" disabled={!comparison.saved || shareBusy || busy || !comparison.results.length} onClick={() => share()}>Create share link</button>
          {shareUrl && <button className="secondary-button" disabled={shareBusy} onClick={() => share(true)}>Revoke link</button>}
          <button className="secondary-button" onClick={() => {
            if (window.location.pathname === '/runs/new') {
              setInput(validateInput(comparison.run)); setComparison(null); setShareUrl(null); setCredentials({});
              attempt.current = null; setError(''); setNotice('');
            } else { prepareReplay(comparison.run); router.push('/runs/new'); }
          }}>Edit a copy</button>
        </div>
        {shareUrl && <p className="text-sm break-all"><Link className="text-blue-700 underline" href={shareUrl}>{shareUrl}</Link></p>}
        {!comparison.saved && <p className="text-xs text-gray-500">Public links need a saved cloud run. JSON and CSV exports work without cloud setup.</p>}
        <details><summary className="text-sm cursor-pointer">Prompt sent to providers</summary><pre className="text-sm font-sans whitespace-pre-wrap break-words mt-3">{comparison.run.resolved_prompt}</pre></details>
      </section>
      <ComparisonResults results={comparison.results} onRetry={model => execute(model)} busy={busy} />
    </>}
  </div>;
}
