import type { Comparison, RunInput } from '@/types';

const tabKey = 'poly-prompt-tab-history-v1';
const offlineKey = 'poly-prompt-offline-history-v1';
const consentKey = 'poly-prompt-offline-consent-v1';

export function localHistory(): Comparison[] {
  try {
    const tab = JSON.parse(sessionStorage.getItem(tabKey) ?? '[]') as Comparison[];
    const offline = offlineEnabled() ? JSON.parse(localStorage.getItem(offlineKey) ?? '[]') as Comparison[] : [];
    return [...new Map([...tab, ...offline].filter(item => item?.run?.id && Array.isArray(item.results))
      .map(item => [item.run.id, item])).values()].slice(0, 50);
  } catch { return []; }
}

export function offlineEnabled(): boolean {
  try { return localStorage.getItem(consentKey) === 'yes'; } catch { return false; }
}

export function setOfflineEnabled(enabled: boolean) {
  if (enabled) {
    const rows = localHistory().slice(0, 5);
    localStorage.setItem(offlineKey, JSON.stringify(rows));
    localStorage.setItem(consentKey, 'yes');
  }
  else { localStorage.removeItem(consentKey); localStorage.removeItem(offlineKey); }
}

export function remember(comparison: Comparison) {
  if (comparison.saved) return;
  // Explicitly copy only product data. Credentials are never part of a Comparison.
  const safe: Comparison = { run: comparison.run, results: comparison.results, saved: false, warning: comparison.warning };
  const rows = [safe, ...localHistory().filter(item => item.run.id !== safe.run.id)].slice(0, 50);
  sessionStorage.setItem(tabKey, JSON.stringify(rows));
  if (offlineEnabled()) localStorage.setItem(offlineKey, JSON.stringify(rows.slice(0, 5)));
}

export function forget(id?: string) {
  if (!id) {
    sessionStorage.removeItem(tabKey);
    sessionStorage.removeItem('poly-prompt-replay-v1');
    localStorage.removeItem(offlineKey);
    return;
  }
  const rows = localHistory().filter(item => item.run.id !== id);
  sessionStorage.setItem(tabKey, JSON.stringify(rows));
  localStorage.removeItem(offlineKey);
  if (offlineEnabled()) localStorage.setItem(offlineKey, JSON.stringify(rows.slice(0, 5)));
}

export function prepareReplay(input: RunInput) {
  sessionStorage.setItem('poly-prompt-replay-v1', JSON.stringify({ title: input.title, prompt: input.prompt,
    variables: input.variables, models: input.models, seed: input.seed, max_output_tokens: input.max_output_tokens }));
}

export function takeReplay(): RunInput | null {
  try {
    const raw = sessionStorage.getItem('poly-prompt-replay-v1');
    sessionStorage.removeItem('poly-prompt-replay-v1');
    return raw ? JSON.parse(raw) as RunInput : null;
  } catch { return null; }
}
