const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateInput, resolvePrompt, variableNames, credentialsFrom, validId } = require('../src/lib/validation.ts');
const { loadCatalog } = require('../src/lib/catalog.ts');
const { executeModel, compare } = require('../src/lib/providers.ts');
const { selectedCatalog, once, requestFingerprint, executeSaved } = require('../src/lib/execution.ts');
const { exportComparison } = require('../src/lib/export.ts');
const { assertSameOrigin, readBody, api } = require('../src/lib/http.ts');
const { ownedRun, history } = require('../src/lib/repository.ts');
const { subscriptionTier, currentSubscription } = require('../src/lib/billing.ts');
const { forget } = require('../src/lib/local-history.ts');

const input = { title: 'Test', prompt: 'Hello {{name}}', variables: { name: 'Ada' }, models: ['openai/gpt-4o-mini'], seed: 7, max_output_tokens: 100 };
const model = { id: input.models[0], name: 'GPT', provider: 'openai', context_length: 128000, input_price: 0.000001, output_price: 0.000002, supports_seed: true };
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const requestId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const key = { openrouter: 'test-only-invalid-key' };
const receipt = { id: 'fixture-receipt', model: model.id, choices: [{ message: { content: '<script>alert(1)</script> text' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20, cost: 0.0032 } };
const fetchReceipt = async () => Response.json(receipt);

test('logout cleanup removes recovery history and queued replay without writing storage or touching another product', t => {
  const tab = new Map([['poly-prompt-tab-history-v1', '[{"private":"isolated recovery data"}]'],
    ['poly-prompt-replay-v1', '{"prompt":"isolated private replay"}'], ['other-product-data', 'preserve']]);
  const device = new Map([['poly-prompt-offline-history-v1', '[{"private":"isolated offline data"}]'],
    ['poly-prompt-offline-consent-v1', 'yes'], ['other-product-data', 'preserve']]);
  for (const [name, values] of [['sessionStorage', tab], ['localStorage', device]]) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value: { getItem: key => values.get(key) ?? null,
      removeItem: key => values.delete(key), setItem: () => { throw new Error('Isolated blocked storage write'); } } });
    t.after(() => { if (original) Object.defineProperty(globalThis, name, original); else delete globalThis[name]; });
  }
  forget();
  assert(!tab.has('poly-prompt-tab-history-v1')); assert(!tab.has('poly-prompt-replay-v1'));
  assert(!device.has('poly-prompt-offline-history-v1'));
  assert(tab.has('other-product-data')); assert(device.has('other-product-data'));
  assert.equal(device.get('poly-prompt-offline-consent-v1'), 'yes');
});

function clientFixture(run, evals = [], profile = { tier: 'free' }) {
  const calls = [];
  return { calls, from(table) {
    const query = { table, filters: [] }; calls.push(query);
    const chain = { select() { return chain; }, eq(name, value) { query.filters.push([name, value]); return chain; },
      gte(name, value) { query.filters.push([name, value]); return chain; }, order() { return chain; },
      ilike(name, value) { query.filters.push([name, value]); return chain; }, range(a, b) { query.range = [a, b]; return Promise.resolve({ data: run ? [run] : [], count: run ? 1 : 0, error: null }); },
      single() { return Promise.resolve({ data: profile, error: null }); },
      maybeSingle() { return Promise.resolve({ data: run && !query.filters.some(([k, v]) => k === 'user_id' && v !== run.user_id) ? run : null, error: null }); },
      then(resolve) { return Promise.resolve({ data: table === 'polyprompt_evals' ? evals : [], error: null }).then(resolve); },
    }; return chain;
  } };
}

for (const [name, mutate] of [
  ['empty prompt', value => ({ ...value, prompt: ' ' })], ['oversized prompt', value => ({ ...value, prompt: 'x'.repeat(4001) })],
  ['no models', value => ({ ...value, models: [] })], ['duplicate models', value => ({ ...value, models: [model.id, model.id] })],
  ['over ten models', value => ({ ...value, models: Array.from({ length: 11 }, (_, i) => `test/model-${i}`) })],
  ['invalid model URL', value => ({ ...value, models: ['https://attacker.invalid'] })], ['negative seed', value => ({ ...value, seed: -1 })],
  ['fractional seed', value => ({ ...value, seed: 0.5 })], ['excess output budget', value => ({ ...value, max_output_tokens: 10001 })],
  ['structured variable value', value => ({ ...value, variables: { name: { nested: 'value' } } })],
]) test(`validation rejects ${name}`, () => assert.throws(() => validateInput(mutate(input))));

test('validation whitelists input and never persists provider keys or user-supplied ownership', () => {
  const result = validateInput({ ...input, credentials: key, user_id: 'attacker', tier: 'pro' });
  assert.deepEqual(result, input); assert(!JSON.stringify(result).includes(key.openrouter));
});
test('variable substitution preserves literal dollars, braces, hostile text, and does not recursively substitute', () => {
  assert.deepEqual(variableNames('{{ x }} {{x}} {{y}}'), ['x', 'y']);
  assert.equal(resolvePrompt('{{x}} / {{x}}', { x: '$& {{y}} <script>' }), '$& {{y}} <script> / $& {{y}} <script>');
  assert.throws(() => resolvePrompt('{{x}}', {})); assert.throws(() => resolvePrompt('{{x}}', { x: 'x'.repeat(4001) }));
});
test('credentials reject header injection; identifiers reject malformed IDs', () => {
  assert.throws(() => credentialsFrom({ openrouter: 'value\r\nInjected' })); assert.throws(() => validId('../../secret'));
});
test('live catalog filters batch/non-text models and retains seed/pricing information', async () => {
  const models = await loadCatalog(async () => Response.json({ data: [
    { id: model.id, name: 'GPT', context_length: 1000, architecture: { input_modalities: ['text'], output_modalities: ['text'] }, pricing: { prompt: '0.000001', completion: '0.000002' }, supported_parameters: ['seed'] },
    { id: 'test/batch:batch', architecture: { input_modalities: ['text'], output_modalities: ['text'] } },
    { id: 'test/image', architecture: { input_modalities: ['text'], output_modalities: ['image'] } },
  ] }));
  assert.equal(models.length, 1); assert.equal(models[0].supports_seed, true); assert.equal(models[0].output_price, 0.000002);
});
test('catalog failures are actionable and never fabricated', async () => {
  await assert.rejects(loadCatalog(async () => new Response('private upstream body', { status: 503 })), /live model catalog is unavailable/);
});
test('provider receipts keep exact actual costs, tokens, model ID and full hostile output', async () => {
  let submitted;
  const result = await executeModel(model, input, key, async (_url, options) => { submitted = JSON.parse(options.body); return fetchReceipt(); });
  assert.equal(submitted.messages[0].content, 'Hello Ada'); assert.equal(submitted.seed, 7); assert.equal(submitted.provider.data_collection, 'deny');
  assert.equal(result.cost_usd, 0.0032); assert.equal(result.cost_source, 'receipt'); assert.equal(result.tokens_out, 20);
  assert.equal(result.output, receipt.choices[0].message.content); assert.equal(result.actual_model, model.id);
});
test('seed is omitted for models that do not support it', async () => {
  const result = await executeModel({ ...model, supports_seed: false }, input, key, async (_url, options) => { assert(!Object.hasOwn(JSON.parse(options.body), 'seed')); return fetchReceipt(); });
  assert.equal(result.seed_applied, false);
});
test('missing receipt cost uses separately labeled input/output catalog estimate', async () => {
  const result = await executeModel(model, input, key, async () => Response.json({ ...receipt, usage: { prompt_tokens: 10, completion_tokens: 20 } }));
  assert.equal(result.cost_source, 'estimate'); assert.equal(result.cost_usd, 10 * model.input_price + 20 * model.output_price);
});
test('missing usage is unknown, never zero or guessed', async () => {
  const result = await executeModel(model, input, key, async () => Response.json({ ...receipt, usage: undefined }));
  assert.equal(result.tokens_in, null); assert.equal(result.tokens_out, null); assert.equal(result.cost_usd, null);
});
for (const [status, code] of [[401, 'auth'], [402, 'credits'], [429, 'rate_limit'], [404, 'retired'], [500, 'unavailable']]) {
  test(`provider ${status} errors are safe and actionable`, async () => {
    const result = await executeModel(model, input, key, async () => new Response(JSON.stringify({ error: { message: key.openrouter } }), { status }));
    assert.equal(result.error_code, code); assert(!JSON.stringify(result).includes(key.openrouter)); assert.equal(result.output, '');
  });
}
test('timeout preserves other model results, aborts upstream, and fan-out starts in parallel', async () => {
  let started = 0; let aborted = false;
  const models = [model, { ...model, id: 'test/slow' }, { ...model, id: 'test/third' }];
  const results = await compare({ ...input, models: models.map(m => m.id) }, models, key, async (_url, options) => {
    started++; const body = JSON.parse(options.body);
    if (body.model === 'test/slow') return new Promise(() => options.signal.addEventListener('abort', () => { aborted = true; }));
    await new Promise(resolve => setTimeout(resolve, 2)); assert.equal(started, 3); return fetchReceipt();
  }, 25);
  assert.equal(results.length, 3); assert.equal(results[1].error_code, 'timeout'); assert.equal(results[0].output, receipt.choices[0].message.content); assert(aborted);
});
test('malformed success bodies fail honestly', async () => {
  const result = await executeModel(model, input, key, async () => Response.json({ choices: [] })); assert.equal(result.error_code, 'invalid_response');
});
test('an empty-text completion retains actual usage and cost receipts even when it failed to answer', async () => {
  const result = await executeModel(model, input, key, async () => Response.json({ ...receipt,
    choices: [{ message: { content: '' }, finish_reason: 'length' }] }));
  assert.equal(result.error_code, 'invalid_response'); assert.equal(result.tokens_out, 20);
  assert.equal(result.cost_usd, 0.0032); assert.equal(result.cost_source, 'receipt'); assert.equal(result.finish_reason, 'length');
});
test('native fallback occurs on explicit rejection and reports the actual native route', async () => {
  let calls = 0;
  const result = await executeModel(model, input, { ...key, openai: 'test-native-key' }, async url => { calls++; return String(url).includes('openrouter') ? new Response('', { status: 401 }) : fetchReceipt(); });
  assert.equal(calls, 2); assert.equal(result.provider, 'openai'); assert.equal(result.cost_source, 'unavailable');
});
test('ambiguous 5xx does not automatically retry or fall back and double bill', async () => {
  let calls = 0;
  const result = await executeModel(model, input, { ...key, openai: 'test-native-key' }, async () => { calls++; return new Response('', { status: 503 }); });
  assert.equal(calls, 1); assert.equal(result.error_code, 'unavailable');
});
test('Anthropic normalizes model IDs and uses real message usage', async () => {
  const result = await executeModel({ ...model, id: 'anthropic/claude-sonnet-4.6', supports_seed: false }, input, { anthropic: 'test-native-key' }, async (_url, options) => {
    assert.equal(JSON.parse(options.body).model, 'claude-sonnet-4-6');
    return Response.json({ id: 'fixture-native', model: 'claude-sonnet-4-6', content: [{ type: 'text', text: 'Response' }], usage: { input_tokens: 2, output_tokens: 3 }, stop_reason: 'end_turn' });
  }); assert.equal(result.output, 'Response'); assert.equal(result.tokens_out, 3); assert.equal(result.seed_applied, false);
});
test('Anthropic translates undotted legacy aliases without silently substituting another model', async () => {
  await executeModel({ ...model, id: 'anthropic/claude-sonnet-4' }, input, { anthropic: 'test-native-key' }, async (_url, options) => {
    assert.equal(JSON.parse(options.body).model, 'claude-sonnet-4-0');
    return new Response('', { status: 404 });
  });
});
test('Google reports text and real output plus thought token usage without exposing thought text', async () => {
  const result = await executeModel({ ...model, id: 'google/gemini-2.5-flash' }, input, { google: 'test-native-key' }, async (_url, options) => {
    assert.equal(options.headers['x-goog-api-key'], 'test-native-key');
    return Response.json({ candidates: [{ content: { parts: [{ text: 'hidden', thought: true }, { text: 'Response' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3, thoughtsTokenCount: 4 } });
  }); assert.equal(result.output, 'Response'); assert.equal(result.tokens_out, 7); assert.equal(result.cost_usd, null);
});
test('Mistral uses native random_seed without pretending OpenRouter costs are native costs', async () => {
  const result = await executeModel({ ...model, id: 'mistralai/mistral-small-2603' }, input, { mistral: 'test-native-key' }, async (_url, options) => {
    assert.equal(JSON.parse(options.body).random_seed, 7); return fetchReceipt();
  }); assert.equal(result.provider, 'mistral'); assert.equal(result.cost_usd, null);
});
test('missing native credentials are rejected before any fan-out', () => {
  assert.throws(() => selectedCatalog(input, [model], {}), /No requests/);
});
test('in-flight and completed duplicate request IDs call the provider only once', async () => {
  let calls = 0; const result = { run: { id }, results: [], saved: false };
  const work = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 3)); return result; };
  const unique = crypto.randomUUID(); const fingerprint = requestFingerprint(input, key, null);
  const responses = await Promise.all([once(unique, fingerprint, work), once(unique, fingerprint, work)]);
  assert.equal(calls, 1); assert.equal(responses[0], responses[1]);
  assert.equal(await once(unique, fingerprint, work), result); assert.equal(calls, 1);
  assert.throws(() => once(unique, 'different', work), /different input/);
});
test('ownership read always constrains the verified user and hides other users', async () => {
  const client = clientFixture({ ...input, id, user_id: userId });
  await assert.rejects(ownedRun(client, 'other-user', id), error => error.status === 404);
  assert(client.calls.some(call => call.table === 'polyprompt_runs' && call.filters.some(([key, value]) => key === 'user_id' && value === 'other-user')));
});
test('history paginates 50 rows and scopes retention/search/ownership', async () => {
  const client = clientFixture({ ...input, id, user_id: userId });
  await history(client, userId, 2, '50%_');
  const query = client.calls.find(call => call.table === 'polyprompt_runs'); assert.deepEqual(query.range, [100, 149]);
  assert(query.filters.some(([key]) => key === 'created_at')); assert(query.filters.some(([key]) => key === 'prompt'));
});
test('already completed saved run returns stored results without another debit', async () => {
  const run = { ...input, id, user_id: userId, executed_at: new Date().toISOString(), status: 'completed' };
  const client = clientFixture(run, [{ model: model.id, output: 'original', error: null }]);
  const result = await executeSaved(client, { rpc() { assert.fail('must not reserve or debit'); } }, userId, id, requestId, key, [model], null, false);
  assert.equal(result.results[0].output, 'original'); assert.equal(result.saved, true);
});
test('retrying a successful model is rejected before debit or provider call', async () => {
  const run = { ...input, id, user_id: userId, executed_at: new Date().toISOString(), status: 'completed' };
  const client = clientFixture(run, [{ model: model.id, output: 'original', error: null }]);
  await assert.rejects(executeSaved(client, { rpc: async () => ({ error: { message: 'invalid_retry' } }) }, userId, id, requestId, key, [model], [model.id], true), /Only failed models/);
});
test('duplicate retry delivery returns durable cached results and ignores changing execution metadata', async () => {
  const run = { ...input, id, user_id: userId, executed_at: new Date().toISOString(), status: 'completed' };
  const client = clientFixture(run, [{ model: model.id, output: 'retry already succeeded', error: null }]);
  const result = await executeSaved(client, { rpc: async () => ({ data: { cached: true }, error: null }) }, userId, id, requestId, key, [model], [model.id], true);
  assert.equal(result.results[0].output, 'retry already succeeded');
  assert.equal(requestFingerprint(input, key, [model.id]), requestFingerprint({ ...run, status: 'running', updated_at: 'different' }, key, [model.id]));
});
test('quota rejection sends no provider request and returns actionable safe error', async () => {
  const client = clientFixture({ ...input, id, user_id: userId, status: 'draft' });
  await assert.rejects(executeSaved(client, { rpc: async () => ({ error: { message: 'quota_exceeded' } }) }, userId, id, requestId, key, [model], null, false), error => error.status === 429);
});
test('cross-origin mutations and oversized/invalid JSON are rejected', async () => {
  assert.throws(() => assertSameOrigin(new Request('https://app.invalid/api/run', { headers: { origin: 'https://evil.invalid' } })), /requested from/);
  await assert.rejects(readBody(new Request('https://app.invalid/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })), /Invalid JSON/);
  await assert.rejects(readBody(new Request('https://app.invalid/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(65537) })), error => error.status === 413);
});
test('same-origin checks use the browser-facing host behind Next normalization and HTTPS proxies', () => {
  assert.doesNotThrow(() => assertSameOrigin(new Request('http://localhost:4318/api/run', {
    headers: { host: '127.0.0.1:4318', origin: 'http://127.0.0.1:4318' },
  })));
  assert.doesNotThrow(() => assertSameOrigin(new Request('http://internal.invalid/api/run', {
    headers: { host: 'app.invalid', 'x-forwarded-proto': 'https', origin: 'https://app.invalid' },
  })));
  assert.throws(() => assertSameOrigin(new Request('http://internal.invalid/api/run', {
    headers: { host: 'app.invalid', 'x-forwarded-proto': 'https', origin: 'https://evil.invalid' },
  })), /requested from/);
});
test('unexpected API errors never return raw credential-bearing error text', async () => {
  const response = await api(async () => { throw new Error(key.openrouter); });
  assert.equal(response.status, 500); assert(!(await response.text()).includes(key.openrouter));
});
test('JSON export excludes ownership; CSV escapes all cells and neutralizes spreadsheet formulas', () => {
  const comparison = { run: { ...input, id, user_id: userId, resolved_prompt: '=HYPERLINK("unsafe")' }, results: [{ model: model.id, output: '=1+1,"quoted"\nsecond line', error: '@command', tokens_in: null, tokens_out: null, cost_usd: null }], saved: true };
  const json = JSON.parse(exportComparison(comparison, 'json')); assert(!Object.hasOwn(json.run, 'user_id'));
  const csv = exportComparison(comparison, 'csv'); assert(csv.includes("'=1+1")); assert(csv.includes("'@command")); assert(csv.includes('""quoted""'));
});
test('billing entitlements require both active status and the configured price', () => {
  assert.equal(subscriptionTier({ status: 'active', items: { data: [{ price: { id: 'configured' } }] } }, 'configured'), 'pro');
  assert.equal(subscriptionTier({ status: 'canceled', items: { data: [{ price: { id: 'configured' } }] } }, 'configured'), 'free');
  assert.equal(subscriptionTier({ status: 'active', items: { data: [{ price: { id: 'other' } }] } }, 'configured'), 'free');
});
test('expiration of an incomplete subscription preserves a different active paid subscription', async () => {
  const subscription = (id, status, owner = userId) => ({ id, status, metadata: { user_id: owner }, items: { data: [{ price: { id: 'configured' } }] } });
  const stripe = { subscriptions: { list(params) {
    assert.equal(params.customer, 'fixture-customer'); assert.equal(params.status, 'all');
    return (async function* () { yield subscription('old-unpaid', 'incomplete_expired'); yield subscription('other-owner', 'active', 'other'); yield subscription('paid', 'active'); })();
  } } };
  assert.equal(await currentSubscription(stripe, 'fixture-customer', userId, 'configured'), 'paid');
  assert.equal(await currentSubscription({ subscriptions: { list: () => (async function* () { yield subscription('cancelled', 'canceled'); })() } }, 'fixture-customer', userId, 'configured'), null);
});
