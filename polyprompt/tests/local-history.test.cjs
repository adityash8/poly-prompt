const { test } = require('node:test');
const assert = require('node:assert/strict');

const tabKey = 'poly-prompt-tab-history-v1';
const replayKey = 'poly-prompt-replay-v1';
const offlineKey = 'poly-prompt-offline-history-v1';
const consentKey = 'poly-prompt-offline-consent-v1';
const ownerA = 'isolated-owner-a';
const ownerB = 'isolated-owner-b';
const input = { title: 'Isolated recovery', prompt: 'Private {{name}}', variables: { name: 'Ada' },
  models: ['openai/gpt-4o-mini'], seed: 7, max_output_tokens: 100 };
function comparison(owner, id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') {
  return { run: { ...input, id, ...(owner ? { user_id: owner } : {}), resolved_prompt: 'Private Ada',
    status: 'completed', is_public: false, created_at: '2026-10-11T00:00:00Z', updated_at: '2026-10-11T00:00:00Z' },
  results: [{ model: input.models[0], output: 'Isolated private output' }], saved: false };
}
function fixture(t, rows = [], replay = input, consent = true) {
  const tab = new Map([[tabKey, JSON.stringify(rows)], [replayKey, JSON.stringify(replay)], ['other-product-data', 'preserve']]);
  const device = new Map([[offlineKey, JSON.stringify(rows)], ['other-product-data', 'preserve']]);
  if (consent) device.set(consentKey, 'yes');
  for (const [name, values] of [['sessionStorage', tab], ['localStorage', device]]) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value: {
      getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key),
    } });
    t.after(() => { if (original) Object.defineProperty(globalThis, name, original); else delete globalThis[name]; });
  }
  const path = require.resolve('../src/lib/local-history.ts');
  delete require.cache[path];
  return { tab, device, cache: require(path) };
}
function assertCleared({ tab, device }) {
  assert(!tab.has(tabKey)); assert(!tab.has(replayKey)); assert(!device.has(offlineKey));
  assert.equal(tab.get('other-product-data'), 'preserve'); assert.equal(device.get('other-product-data'), 'preserve');
}

test('unresolved auth cannot read or consume owner recovery, replay, or results', t => {
  const { tab, cache } = fixture(t, [comparison(ownerA)]);
  assert.deepEqual(cache.localHistory(), []); assert.equal(cache.takeReplay(), null);
  assert(tab.has(replayKey));
  assert.throws(() => cache.remember(comparison()), /current session/);
  assert.throws(() => cache.prepareReplay(input), /current session/);
});
for (const owner of [null, ownerB]) test(`initial ${owner ?? 'guest'} rejects all owner A recovery stores`, t => {
  const state = fixture(t, [comparison(ownerA)]);
  assert.equal(state.cache.reconcileLocalHistory(owner), true);
  assertCleared(state); assert.equal(state.device.get(consentKey), 'yes');
  assert.deepEqual(state.cache.localHistory(), []); assert.equal(state.cache.takeReplay(), null);
});
test('same-owner startup preserves cloud-failure recovery and a matching legacy replay', t => {
  const row = comparison(ownerA);
  const state = fixture(t, [row]);
  assert.equal(state.cache.reconcileLocalHistory(ownerA), false);
  assert.deepEqual(state.cache.localHistory(), [row]); assert(state.device.has(offlineKey));
  assert.deepEqual(state.cache.takeReplay(), input); assert(!state.tab.has(replayKey));
  assert.equal(state.cache.reconcileLocalHistory(ownerA), false);
  assert.deepEqual(state.cache.localHistory(), [row]);
});
test('valid guest recovery and explicitly guest replay survive anonymous startup and sign-in', t => {
  const row = { ...comparison(), owner_id: null };
  const { cache, tab } = fixture(t, [row], { ...input, owner_id: null });
  assert.equal(cache.reconcileLocalHistory(null), false);
  assert.equal(cache.reconcileLocalHistory(ownerA), false);
  assert.deepEqual(cache.localHistory(), [row]); assert.deepEqual(cache.takeReplay(), input);
  assert(!tab.has(replayKey));
});
test('an unmarked replay is preserved alongside a matching explicitly guest comparison', t => {
  const row = { ...comparison(), owner_id: null };
  const { cache } = fixture(t, [row]);
  assert.equal(cache.reconcileLocalHistory(null), false);
  assert.deepEqual(cache.takeReplay(), input); assert.deepEqual(cache.localHistory(), [row]);
});
test('an unattributed legacy replay without a matching authorized run is discarded', t => {
  const state = fixture(t, []);
  assert.equal(state.cache.reconcileLocalHistory(null), true); assertCleared(state);
});
for (const owner of [null, ownerB]) test(`owned replay alone cannot reach initial ${owner ?? 'guest'}`, t => {
  const state = fixture(t, [], { ...input, owner_id: ownerA });
  assert.equal(state.cache.reconcileLocalHistory(owner), true); assertCleared(state);
  assert.equal(state.cache.takeReplay(), null);
});
test('new authenticated tab-only comparisons and drafts carry ownership even without cloud storage', t => {
  const { cache, tab } = fixture(t, [], null);
  cache.reconcileLocalHistory(ownerA);
  cache.remember(comparison());
  assert.equal(JSON.parse(tab.get(tabKey))[0].owner_id, ownerA);
  assert(!Object.hasOwn(JSON.parse(tab.get(tabKey))[0].run, 'user_id'));
  cache.prepareReplay(input);
  assert.equal(JSON.parse(tab.get(replayKey)).owner_id, ownerA);
  assert.deepEqual(cache.takeReplay(), input);
  cache.prepareReplay(input);
  cache.reconcileLocalHistory(ownerB);
  assert.deepEqual(cache.localHistory(), []); assert(!tab.has(replayKey));
});
test('guest BYO comparisons and queued templates remain unowned and replay without history', t => {
  const { cache, tab } = fixture(t, [], null);
  cache.reconcileLocalHistory(null);
  cache.prepareReplay(input);
  assert.equal(JSON.parse(tab.get(replayKey)).owner_id, null);
  assert.deepEqual(cache.takeReplay(), input);
  cache.remember(comparison());
  assert(!Object.hasOwn(JSON.parse(tab.get(tabKey))[0].run, 'user_id'));
  assert.equal(JSON.parse(tab.get(tabKey))[0].owner_id, null);
});
for (const owner of [null, ownerB, ownerA]) test(`tab-only owner metadata is enforced for initial ${owner ?? 'guest'}`, t => {
  const row = { ...comparison(), owner_id: ownerA };
  const state = fixture(t, [row], { ...input, owner_id: ownerA });
  assert.equal(state.cache.reconcileLocalHistory(owner), owner !== ownerA);
  if (owner === ownerA) { assert.deepEqual(state.cache.localHistory(), [row]); assert.deepEqual(state.cache.takeReplay(), input); }
  else { assertCleared(state); assert.deepEqual(state.cache.localHistory(), []); }
});
test('cache reads and replay reject another owner injected after session resolution', t => {
  const { cache, tab, device } = fixture(t, [], null);
  cache.reconcileLocalHistory(ownerB);
  const own = comparison(ownerB, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  tab.set(tabKey, JSON.stringify([comparison(ownerA), own])); device.set(offlineKey, JSON.stringify([comparison(ownerA)]));
  tab.set(replayKey, JSON.stringify({ ...input, owner_id: ownerA }));
  assert.deepEqual(cache.localHistory(), [own]); assert.equal(cache.takeReplay(), null);
  assert.throws(() => cache.remember(comparison(ownerA)), /current session/);
  assert.throws(() => cache.prepareReplay(comparison(ownerA).run), /current session/);
});
test('storage cleanup failure still closes reads and replay to the prior owner', t => {
  const { cache } = fixture(t, [comparison(ownerA)]);
  sessionStorage.removeItem = () => { throw new Error('Isolated storage restrictions'); };
  assert.throws(() => cache.reconcileLocalHistory(ownerB), /storage restrictions/);
  assert.deepEqual(cache.localHistory(), []); assert.equal(cache.takeReplay(), null);
});
test('disabled offline consent cannot conceal prior-owner rows from startup cleanup', t => {
  const state = fixture(t, [comparison(ownerA)], null, false);
  state.tab.set(tabKey, '[]');
  assert.equal(state.cache.reconcileLocalHistory(null), true); assertCleared(state);
});
test('ownership reconciliation scans rows beyond the visible fifty-run history', t => {
  const rows = Array.from({ length: 50 }, (_, index) => ({ ...comparison(null, `isolated-guest-${index}`), owner_id: null }));
  rows.push(comparison(ownerA));
  const state = fixture(t, rows, null);
  assert.equal(state.cache.reconcileLocalHistory(null), true);
  assert.equal(state.cache.localHistory().length, 50);
  assert(!JSON.parse(state.tab.get(tabKey)).some(row => row.run.user_id === ownerA));
  assert(!JSON.parse(state.device.get(offlineKey)).some(row => row.run.user_id === ownerA));
});
for (const owner of [null, ownerB]) test(`mixed startup recovery preserves ${owner ?? 'guest'} work while removing owner A`, t => {
  const row = { ...comparison(owner, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), owner_id: owner };
  const state = fixture(t, [comparison(ownerA), row], { ...input, owner_id: owner });
  assert.equal(state.cache.reconcileLocalHistory(owner), true);
  assert.deepEqual(state.cache.localHistory(), [row]);
  assert.deepEqual(JSON.parse(state.tab.get(tabKey)), [row]); assert.deepEqual(JSON.parse(state.device.get(offlineKey)), [row]);
  assert.deepEqual(state.cache.takeReplay(), input);
});
test('rejecting an unprovable legacy replay preserves authorized guest recovery', t => {
  const row = { ...comparison(), owner_id: null };
  const state = fixture(t, [row], { ...input, prompt: 'Unattributed legacy prompt' });
  assert.equal(state.cache.reconcileLocalHistory(null), true);
  assert.deepEqual(state.cache.localHistory(), [row]); assert(!state.tab.has(replayKey));
  assert.deepEqual(JSON.parse(state.device.get(offlineKey)), [row]);
});
for (const owner of [null, ownerB]) {
  for (const ambiguousReplay of [false, true]) test(`mixed ${owner ?? 'guest'} cache retains proven work and ${ambiguousReplay ? 'rejects ambiguous' : 'retains guest'} replay`, t => {
    function distinct(row, name) {
      return { ...row, run: { ...row.run, id: name, title: name, prompt: `${name} {{name}}` } };
    }
    const guest = distinct({ ...comparison(), owner_id: null }, 'explicit-guest');
    const ownLegacy = distinct(comparison(ownerB), 'owned-legacy');
    const ownCurrent = distinct({ ...comparison(), owner_id: ownerB }, 'owned-current');
    const foreignLegacy = distinct(comparison(ownerA), 'foreign-legacy');
    const foreignCurrent = distinct({ ...comparison(), owner_id: ownerA }, 'foreign-current');
    const ambiguous = distinct(comparison(), 'ambiguous-authenticated');
    const replay = { ...input, title: ambiguousReplay ? ambiguous.run.title : guest.run.title,
      prompt: ambiguousReplay ? ambiguous.run.prompt : guest.run.prompt };
    const state = fixture(t, [guest, ownLegacy, foreignLegacy, ownCurrent, foreignCurrent, ambiguous], replay);
    const allowed = owner === null ? [guest] : [guest, ownLegacy, ownCurrent];
    assert.equal(state.cache.reconcileLocalHistory(owner), true);
    assert.deepEqual(state.cache.localHistory(), allowed);
    assert.deepEqual(JSON.parse(state.tab.get(tabKey)), allowed);
    assert.deepEqual(JSON.parse(state.device.get(offlineKey)), allowed);
    assert.deepEqual(state.cache.takeReplay(), ambiguousReplay ? null : replay);
    assert.equal(state.device.get(consentKey), 'yes');
    assert.equal(state.tab.get('other-product-data'), 'preserve');
  });
}
test('same-owner mixed recovery retains an unmarked replay proved by the owned legacy record', t => {
  const legacy = comparison(ownerB);
  const current = { ...comparison(null, 'current-tab-only'), owner_id: ownerB };
  const guest = { ...comparison(null, 'guest-tab-only'), owner_id: null };
  const state = fixture(t, [comparison(ownerA), comparison(), legacy, current, guest]);
  assert.equal(state.cache.reconcileLocalHistory(ownerB), true);
  assert.deepEqual(state.cache.localHistory(), [legacy, current, guest]);
  assert.deepEqual(state.cache.takeReplay(), input);
});
test('conflicting or invalid envelope ownership cannot authorize a comparison', t => {
  const rows = [
    { ...comparison(ownerB, 'guest-conflict'), owner_id: null },
    { ...comparison(ownerB, 'owner-conflict'), owner_id: ownerA },
    { ...comparison(null, 'invalid-marker'), owner_id: 42 },
  ];
  const state = fixture(t, rows);
  assert.equal(state.cache.reconcileLocalHistory(ownerB), true);
  assert.deepEqual(state.cache.localHistory(), []); assert.equal(state.cache.takeReplay(), null);
  assertCleared(state);
});
test('an ambiguous record injected after session resolution cannot authorize history or replay', t => {
  const { cache, tab, device } = fixture(t, [], null);
  cache.reconcileLocalHistory(ownerB);
  tab.set(tabKey, JSON.stringify([comparison()])); device.set(offlineKey, JSON.stringify([comparison()]));
  tab.set(replayKey, JSON.stringify(input));
  assert.deepEqual(cache.localHistory(), []); assert.equal(cache.takeReplay(), null);
});
test('blocked ambiguous-cache cleanup still closes history and matching old replay', t => {
  const { cache } = fixture(t, [comparison()]);
  sessionStorage.removeItem = () => { throw new Error('Isolated storage restrictions'); };
  assert.throws(() => cache.reconcileLocalHistory(null), /storage restrictions/);
  assert.deepEqual(cache.localHistory(), []); assert.equal(cache.takeReplay(), null);
});
test('forced logout cleanup removes all three recovery stores exactly once and preserves consent', t => {
  const state = fixture(t, [comparison(ownerA)]);
  state.cache.reconcileLocalHistory(ownerA);
  const calls = [];
  for (const storage of [sessionStorage, localStorage]) {
    const remove = storage.removeItem;
    storage.removeItem = key => { calls.push(key); return remove(key); };
  }
  assert.equal(state.cache.reconcileLocalHistory(null, true), true);
  assert.deepEqual(calls, [tabKey, replayKey, offlineKey]); assertCleared(state);
  assert.equal(state.device.get(consentKey), 'yes');
});
