import type { Comparison, RunInput } from '@/types';

const tabKey = 'poly-prompt-tab-history-v1';
const offlineKey = 'poly-prompt-offline-history-v1';
const consentKey = 'poly-prompt-offline-consent-v1';
const replayKey = 'poly-prompt-replay-v1';
let currentOwner: string | null | undefined;
type CachedComparison = Comparison & { owner_id?: string | null };

function cachedRows(storage: Storage, key: string): CachedComparison[] {
  try {
    const rows = JSON.parse(storage.getItem(key) ?? '[]') as CachedComparison[];
    return rows.filter(item => item?.run?.id && Array.isArray(item.results));
  } catch { return []; }
}

function cachedHistory(): CachedComparison[] {
  try {
    return [...cachedRows(sessionStorage, tabKey), ...(offlineEnabled() ? cachedRows(localStorage, offlineKey) : [])];
  } catch { return []; }
}

function allowedOwner(owner: unknown): boolean {
  return currentOwner !== undefined && (owner == null || owner === currentOwner);
}

function allowedComparison(item: CachedComparison): boolean {
  if (!allowedOwner(item.run.user_id)) return false;
  if (item.owner_id === null) return item.run.user_id == null;
  // Missing markers cannot prove guest ownership: authenticated tab-only responses omit run.user_id.
  const owner = item.owner_id ?? item.run.user_id;
  return typeof owner === 'string' && owner === currentOwner;
}

export function localHistory(): Comparison[] {
  return [...new Map(cachedHistory().filter(allowedComparison)
    .map(item => [item.run.id, item])).values()].slice(0, 50);
}

function replayInput(input: RunInput): RunInput {
  return { title: input.title, prompt: input.prompt, variables: input.variables, models: input.models,
    seed: input.seed, max_output_tokens: input.max_output_tokens };
}

function queuedReplay(): (RunInput & { owner_id?: unknown }) | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(replayKey) ?? 'null');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

function allowedReplay(input: RunInput & { owner_id?: unknown }): boolean {
  if (currentOwner === undefined) return false;
  if (Object.hasOwn(input, 'owner_id')) return allowedOwner(input.owner_id);
  // Legacy replays have no ownership marker. Recover only alongside a matching authorized run.
  return localHistory().some(item => JSON.stringify(replayInput(item.run)) === JSON.stringify(replayInput(input)));
}

export function reconcileLocalHistory(owner: string | null, clear = false): boolean {
  // Set the read boundary first, even when browser storage refuses cleanup.
  currentOwner = owner;
  if (clear) { forget(); return true; }
  const tab = cachedRows(sessionStorage, tabKey);
  const offline = cachedRows(localStorage, offlineKey);
  const replay = queuedReplay();
  const rejectReplay = replay !== null && !allowedReplay(replay);
  if (![...tab, ...offline].some(item => !allowedComparison(item)) && !rejectReplay) return false;
  for (const [storage, key, rows] of [[sessionStorage, tabKey, tab], [localStorage, offlineKey, offline]] as const) {
    const allowed = rows.filter(allowedComparison);
    if (allowed.length) storage.setItem(key, JSON.stringify(allowed));
    else storage.removeItem(key);
  }
  if (rejectReplay || replay === null) sessionStorage.removeItem(replayKey);
  return true;
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
  if (!allowedOwner(comparison.run.user_id)) throw new Error('This comparison is unavailable in the current session.');
  // Explicitly copy only product data. Credentials are never part of a Comparison.
  // Cache ownership does not imply that a tab-only run exists in cloud storage.
  const safe: CachedComparison = { run: comparison.run, results: comparison.results, saved: false,
    warning: comparison.warning, owner_id: currentOwner };
  const rows = [safe, ...localHistory().filter(item => item.run.id !== safe.run.id)].slice(0, 50);
  sessionStorage.setItem(tabKey, JSON.stringify(rows));
  if (offlineEnabled()) localStorage.setItem(offlineKey, JSON.stringify(rows.slice(0, 5)));
}

export function forget(id?: string) {
  if (!id) {
    sessionStorage.removeItem(tabKey);
    sessionStorage.removeItem(replayKey);
    localStorage.removeItem(offlineKey);
    return;
  }
  const rows = localHistory().filter(item => item.run.id !== id);
  sessionStorage.setItem(tabKey, JSON.stringify(rows));
  localStorage.removeItem(offlineKey);
  if (offlineEnabled()) localStorage.setItem(offlineKey, JSON.stringify(rows.slice(0, 5)));
}

export function prepareReplay(input: RunInput & { user_id?: string }) {
  if (!allowedOwner(input.user_id)) throw new Error('This comparison is unavailable in the current session.');
  sessionStorage.setItem(replayKey, JSON.stringify({ ...replayInput(input), owner_id: currentOwner }));
}

export function takeReplay(): RunInput | null {
  if (currentOwner === undefined) return null;
  try {
    const input = queuedReplay();
    sessionStorage.removeItem(replayKey);
    return input && allowedReplay(input) ? replayInput(input) : null;
  } catch { return null; }
}
