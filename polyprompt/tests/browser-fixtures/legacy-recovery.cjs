const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const ts = require('typescript');
const resolve = Module._resolveFilename;
const loader = require.extensions['.ts'];
require('../register.cjs');

const server = require('../../src/lib/supabase-server.ts');
const catalog = require('../../src/lib/catalog.ts');
const providers = require('../../src/lib/providers.ts');
const runRoute = require('../../src/app/api/run/route.ts');
// The API loader must not replace Playwright's transform for subsequent browser specs.
Module._resolveFilename = resolve;
if (loader) require.extensions['.ts'] = loader; else delete require.extensions['.ts'];
const input = { title: 'Isolated legacy authenticated tab-only', prompt: 'Isolated legacy private {{name}}',
  variables: { name: 'Ada' }, models: ['openai/gpt-4o-mini'], seed: null, max_output_tokens: 100 };

async function authenticatedTabComparison() {
  const originals = [];
  function replace(module, name, value) {
    const original = module[name];
    originals.push(() => { module[name] = original; });
    module[name] = value;
  }
  let authenticated = false;
  let providerCalls = 0;
  const denyCloud = () => assert.fail('Tab-only execution must not access a database');
  const fetch = globalThis.fetch;
  globalThis.fetch = () => assert.fail('The regression must not contact an external service');
  try {
    replace(server, 'createServerClient', async () => ({ from: denyCloud, rpc: denyCloud,
      auth: { getUser: async () => { authenticated = true; return { data: { user: { id: 'isolated-owner-a' } } }; } } }));
    replace(server, 'createServiceClient', () => ({ from: denyCloud, rpc: denyCloud }));
    replace(catalog, 'loadCatalog', async () => [{ id: input.models[0], name: 'Isolated legacy fixture', provider: 'openai', supports_seed: true }]);
    replace(providers, 'compare', async submitted => {
      assert.deepEqual(submitted, input); providerCalls++;
      return [{ model: input.models[0], provider: 'openrouter', output: 'Isolated legacy private provider output',
        tokens_in: 1, tokens_out: 1, cost_usd: null, cost_source: 'unavailable', latency_ms: 0,
        error: null, error_code: null, actual_model: input.models[0], generation_id: null,
        finish_reason: 'stop', seed_applied: false, created_at: '2026-10-11T00:00:00Z' }];
    });
    const response = await runRoute.POST(new Request('https://app.invalid/api/run', { method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'https://app.invalid' },
      body: JSON.stringify({ ...input, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', request_id: crypto.randomUUID(),
        credentials: { openrouter: 'isolated-test-only-invalid-key' }, save: false }) }));
    assert.equal(response.status, 200); assert.equal(authenticated, true); assert.equal(providerCalls, 1);
    const comparison = await response.json();
    assert.equal(comparison.saved, false); assert.match(comparison.warning, /kept in this tab/);
    assert(!Object.hasOwn(comparison.run, 'user_id')); assert(!Object.hasOwn(comparison, 'owner_id'));
    assert(!JSON.stringify(comparison).includes('isolated-test-only-invalid-key'));
    return comparison;
  } finally {
    for (const restore of originals.reverse()) restore();
    globalThis.fetch = fetch;
  }
}

function legacyRecovery(comparison) {
  // Exact indexed pre-startup source, SHA-256 563fd272f31bc21fdb873aae22e3e46205c27c6405bc69f1a481dd5612af5283.
  // This historical producer is test-only; no legacy runtime path ships in the app.
  const source = fs.readFileSync(path.join(__dirname, 'pre-startup-local-history.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const tab = new Map(); const device = new Map();
  function storage(values) {
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  }
  const context = vm.createContext({ exports: {}, sessionStorage: storage(tab), localStorage: storage(device) });
  vm.runInContext(compiled.outputText, context);
  context.exports.remember(comparison);
  context.exports.setOfflineEnabled(true);
  context.exports.prepareReplay(comparison.run);
  return { tab: Object.fromEntries(tab), device: Object.fromEntries(device) };
}

module.exports = { authenticatedTabComparison, legacyRecovery, input };
