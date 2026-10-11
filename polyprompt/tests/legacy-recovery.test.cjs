const { test } = require('node:test');
const assert = require('node:assert/strict');
const { authenticatedTabComparison, legacyRecovery } = require('./browser-fixtures/legacy-recovery.cjs');

const tabKey = 'poly-prompt-tab-history-v1';
const offlineKey = 'poly-prompt-offline-history-v1';
const replayKey = 'poly-prompt-replay-v1';

for (const owner of [null, 'isolated-owner-b', 'isolated-owner-a']) {
  test(`actual auth+save:false through the old cache cannot restore ambiguous recovery for initial ${owner ?? 'guest'}`, async t => {
    const comparison = await authenticatedTabComparison();
    const stores = legacyRecovery(comparison);
    const rows = JSON.parse(stores.tab[tabKey]);
    assert.equal(rows[0].run.prompt, comparison.run.prompt);
    assert.equal(rows[0].results[0].output, comparison.results[0].output);
    assert(!Object.hasOwn(rows[0], 'owner_id')); assert(!Object.hasOwn(rows[0].run, 'user_id'));
    assert(!Object.hasOwn(JSON.parse(stores.tab[replayKey]), 'owner_id'));
    assert.equal(JSON.parse(stores.device[offlineKey])[0].run.id, comparison.run.id);
    for (const [name, values] of [['sessionStorage', stores.tab], ['localStorage', stores.device]]) {
      const original = Object.getOwnPropertyDescriptor(globalThis, name);
      Object.defineProperty(globalThis, name, { configurable: true, value: {
        getItem: key => values[key] ?? null, setItem: (key, value) => { values[key] = value; }, removeItem: key => { delete values[key]; },
      } });
      t.after(() => { if (original) Object.defineProperty(globalThis, name, original); else delete globalThis[name]; });
    }
    const path = require.resolve('../src/lib/local-history.ts'); delete require.cache[path];
    const cache = require(path);
    assert.deepEqual(cache.localHistory(), []); assert.equal(cache.takeReplay(), null);
    assert(Object.hasOwn(stores.tab, replayKey), 'Unresolved auth must not consume replay');
    assert.equal(cache.reconcileLocalHistory(owner), true, 'Ambiguous authenticated recovery requires a reset');
    assert.deepEqual(cache.localHistory(), []); assert.equal(cache.takeReplay(), null);
    assert(!Object.hasOwn(stores.tab, tabKey)); assert(!Object.hasOwn(stores.tab, replayKey));
    assert(!Object.hasOwn(stores.device, offlineKey));
    assert.equal(stores.device['poly-prompt-offline-consent-v1'], 'yes');
  });
}
