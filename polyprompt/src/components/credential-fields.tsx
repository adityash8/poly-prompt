'use client';
import type { Credentials, Provider } from '@/types';

const providers: { id: Provider; label: string }[] = [
  { id: 'openrouter', label: 'OpenRouter key (all models)' }, { id: 'openai', label: 'OpenAI key' },
  { id: 'anthropic', label: 'Anthropic key' }, { id: 'google', label: 'Google AI key' }, { id: 'mistral', label: 'Mistral key' },
];

export function CredentialFields({ credentials, onChange, disabled }: {
  credentials: Credentials; onChange: (value: Credentials) => void; disabled: boolean;
}) {
  return <fieldset disabled={disabled} className="border rounded-lg p-4 space-y-3">
    <legend className="font-medium">Your provider keys</legend>
    <p className="text-sm text-muted-foreground">An OpenRouter key covers all listed models. Native keys can run their provider’s models directly, or act as fallback after an explicit rejection. Keys stay in memory and are sent only to this server and the selected provider. They are cleared when you leave this page.</p>
    <label htmlFor="key-openrouter" className="block text-sm">{providers[0].label}</label>
    <input id="key-openrouter" type="password" autoComplete="off" spellCheck={false} value={credentials.openrouter ?? ''}
      onChange={event => onChange({ ...credentials, openrouter: event.target.value })} className="field" />
    <details><summary className="cursor-pointer text-sm text-link">Native provider keys and fallback</summary>
      <div className="grid sm:grid-cols-2 gap-3 mt-3">{providers.slice(1).map(provider => <label key={provider.id} className="text-sm">
        {provider.label}<input aria-label={provider.label} type="password" autoComplete="off" spellCheck={false}
          value={credentials[provider.id] ?? ''} onChange={event => onChange({ ...credentials, [provider.id]: event.target.value })} className="field mt-1" />
      </label>)}</div>
    </details>
    <button type="button" onClick={() => onChange({})} className="text-sm text-muted-foreground underline">Clear keys</button>
  </fieldset>;
}
