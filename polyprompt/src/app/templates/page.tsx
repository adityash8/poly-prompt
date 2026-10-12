'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Template } from '@/types';
import { STARTER_TEMPLATES } from '@/lib/templates';
import { fetchJson } from '@/lib/client-api';
import { prepareReplay } from '@/lib/local-history';
import { AppNav } from '@/components/app-nav';

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>(STARTER_TEMPLATES);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [error, setError] = useState('');
  useEffect(() => { fetchJson<Template[]>('/api/templates').then(setTemplates).catch(cause => setError(cause.message)); }, []);
  const filtered = templates.filter(template => (category === 'all' || template.category === category) &&
    `${template.title} ${template.prompt}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="app-shell"><AppNav /><main className="workspace-main space-y-6">
    <h1 className="page-title">Prompt templates</h1><p className="text-muted-foreground">Authored starting points. Edit the variables before you run them.</p>
    {error && <p className="text-sm text-warning" role="alert">{error}</p>}
    <div className="flex flex-wrap gap-3"><input aria-label="Search templates" placeholder="Search templates" value={search} onChange={event => setSearch(event.target.value)} className="field sm:flex-1 sm:w-auto" />
      <select aria-label="Template category" value={category} onChange={event => setCategory(event.target.value)} className="field sm:w-auto"><option value="all">All categories</option>{[...new Set(templates.map(template => template.category))].map(value => <option key={value}>{value}</option>)}</select></div>
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{filtered.map(template => <article key={template.id} className="surface-panel border rounded-lg p-5 flex flex-col gap-3">
      <h2 className="font-semibold">{template.title}</h2><p className="text-sm text-muted-foreground">{template.description}</p><pre className="text-sm font-sans whitespace-pre-wrap line-clamp-4 bg-canvas rounded-lg p-3">{template.prompt}</pre>
      <p className="text-xs text-muted-foreground">Variables: {Object.keys(template.variables).join(', ') || 'None'}</p>
      <button className="primary-button mt-auto" onClick={() => { prepareReplay({ title: template.title, prompt: template.prompt, variables: template.variables,
        models: [], seed: null, max_output_tokens: 1000 }); router.push('/runs/new'); }}>Use template</button>
      {!STARTER_TEMPLATES.some(starter => starter.id === template.id) && <button className="text-sm text-error" onClick={async () => {
        if (!window.confirm('Delete this personal template? This cannot be undone.')) return;
        try { await fetchJson(`/api/templates/${template.id}`, { method: 'DELETE' }); setTemplates(current => current.filter(item => item.id !== template.id)); }
        catch (cause) { setError((cause as Error).message); }
      }}>Delete personal template</button>}
    </article>)}</div>
    {!filtered.length && <p>No templates match your filters.</p>}
  </main></div>;
}
