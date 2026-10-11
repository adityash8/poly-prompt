const { test } = require('node:test');
const assert = require('node:assert/strict');
const server = require('../src/lib/supabase-server.ts');
const catalog = require('../src/lib/catalog.ts');
const execution = require('../src/lib/execution.ts');
const repository = require('../src/lib/repository.ts');
const providers = require('../src/lib/providers.ts');
const billing = require('../src/lib/billing.ts');
const Stripe = require('stripe');
const { AppError } = require('../src/lib/validation.ts');
const runRoute = require('../src/app/api/run/route.ts');
const shareRoute = require('../src/app/api/runs/[id]/share/route.ts');
const sharedRoute = require('../src/app/api/shared/[shareId]/route.ts');
const historyRoute = require('../src/app/api/runs/route.ts');
const setupRoute = require('../src/app/api/setup/route.ts');
const webhookRoute = require('../src/app/api/billing/webhook/route.ts');
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const model = { id: 'openai/gpt-4o-mini', name: 'Fixture', provider: 'openai', supports_seed: true };
const input = { title: 'API regression', prompt: 'Test input', variables: {}, models: [model.id], seed: null, max_output_tokens: 100 };
function replace(t, module, name, value) {
  const original = module[name]; module[name] = value; t.after(() => { module[name] = original; });
}
function request(path, body, method = 'POST') {
  return new Request(`https://app.invalid${path}`, { method, headers: { 'Content-Type': 'application/json', origin: 'https://app.invalid' }, ...(body ? { body: JSON.stringify(body) } : {}) });
}

test('hosted execution cannot skip atomic quota checks by disabling cloud saving', async t => {
  const id = crypto.randomUUID();
  const original = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'isolated-test-key';
  t.after(() => { if (original === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = original; });
  const client = { auth: { getUser: async () => ({ data: { user: { id: userId } } }) } };
  replace(t, server, 'createServerClient', async () => client);
  replace(t, server, 'createServiceClient', () => ({}));
  replace(t, catalog, 'loadCatalog', async () => [model]);
  replace(t, repository, 'ownedRun', async () => ({ ...input, id, user_id: userId, resolved_prompt: input.prompt }));
  let reservations = 0;
  replace(t, execution, 'executeSaved', async (_client, _admin, owner, runId, _requestId, _keys, _catalog, _retry, byok) => {
    assert.equal(owner, userId); assert.equal(runId, id); assert.equal(byok, false);
    reservations++; throw new AppError(429, 'Hosted quota reached');
  });
  replace(t, providers, 'compare', () => assert.fail('A provider must not be called after quota rejection'));
  const response = await runRoute.POST(request('/api/run', { ...input, id, request_id: crypto.randomUUID(), use_hosted: true, save: false }));
  assert.equal(response.status, 429); assert.equal(reservations, 1);
  assert.match((await response.json()).error, /quota/);
});

test('BYO works without cloud storage and returns adapter output without credentials', async t => {
  replace(t, server, 'createServerClient', async () => null);
  replace(t, server, 'createServiceClient', () => null);
  replace(t, catalog, 'loadCatalog', async () => [model]);
  const key = 'isolated-test-key';
  replace(t, providers, 'compare', async (submitted, models, credentials) => {
    assert.deepEqual(submitted, input); assert.equal(models[0].id, model.id); assert.equal(credentials.openrouter, key);
    // Deterministic test adapter output. No fake response path exists in the product.
    return [{ model: model.id, output: '<script>literal output</script>', error: null, tokens_in: null, tokens_out: null, cost_usd: null }];
  });
  const response = await runRoute.POST(request('/api/run', { ...input, id: crypto.randomUUID(), request_id: crypto.randomUUID(), credentials: { openrouter: key } }));
  const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.saved, false); assert.equal(body.results[0].output, '<script>literal output</script>');
  assert(!JSON.stringify(body).includes(key)); assert(!Object.hasOwn(body.run, 'user_id'));
});

test('signed-in BYO can stay in the tab when the shared database is not migrated', async t => {
  replace(t, server, 'createServerClient', async () => ({ auth: { getUser: async () => ({ data: { user: { id: userId } } }) } }));
  replace(t, server, 'createServiceClient', () => ({}));
  replace(t, catalog, 'loadCatalog', async () => [model]);
  replace(t, repository, 'ownedRun', () => assert.fail('Tab mode must not depend on a database table'));
  replace(t, providers, 'compare', async () => [{ model: model.id, output: 'Isolated test result', error: null }]);
  const response = await runRoute.POST(request('/api/run', { ...input, id: crypto.randomUUID(), request_id: crypto.randomUUID(), credentials: { openrouter: 'isolated-test-key' }, save: false }));
  assert.equal(response.status, 200);
  const body = await response.json(); assert.equal(body.saved, false); assert.match(body.warning, /kept in this tab/);
});

test('private history rejects an unverified identity instead of returning an empty success', async t => {
  replace(t, server, 'requireUser', async () => { throw new AppError(401, 'Sign in'); });
  const response = await historyRoute.GET(request('/api/runs', null, 'GET'));
  assert.equal(response.status, 401); assert.match((await response.json()).error, /Sign in/);
});

test('deleting all cloud comparisons includes expired rows and constrains every operation to the verified owner', async t => {
  const calls = [];
  replace(t, server, 'requireUser', async () => ({ user: { id: userId }, supabase: { from: name => {
    assert.equal(name, 'polyprompt_runs'); return { delete: () => ({ eq: async (column, owner) => {
      assert.equal(column, 'user_id'); assert.equal(owner, userId); calls.push('delete_owned'); return { error: null };
    } }) };
  } } }));
  replace(t, server, 'createServiceClient', () => ({ rpc: async (name, args) => {
    assert.equal(name, 'polyprompt_prune_expired_runs'); assert.equal(args.p_user_id, userId);
    calls.push('prune_owned_expired'); return { error: null };
  } }));
  assert.equal((await historyRoute.DELETE(request('/api/runs', null, 'DELETE'))).status, 200);
  assert.deepEqual(calls, ['prune_owned_expired', 'delete_owned']);
});

test('cloud deletion never reports success if expired-row cleanup is unavailable', async t => {
  replace(t, server, 'requireUser', async () => ({ user: { id: userId }, supabase: {
    from: () => assert.fail('Do not silently delete only visible history and report complete success'),
  } }));
  replace(t, server, 'createServiceClient', () => ({ rpc: async () => ({ error: { message: 'Isolated private cleanup failure' } }) }));
  const response = await historyRoute.DELETE(request('/api/runs', null, 'DELETE'));
  assert.equal(response.status, 503); assert(!(await response.text()).includes('private cleanup failure'));
});

test('sharing another owner run fails before the privileged share RPC', async t => {
  replace(t, server, 'requireUser', async () => ({ supabase: {}, user: { id: userId } }));
  replace(t, repository, 'ownedRun', async (_client, owner) => { assert.equal(owner, userId); throw new AppError(404, 'Run not found'); });
  replace(t, server, 'createServiceClient', () => assert.fail('Must verify ownership first'));
  const response = await shareRoute.POST(request('/api/runs/id/share'), { params: Promise.resolve({ id: crypto.randomUUID() }) });
  assert.equal(response.status, 404);
});

test('history retention failure and shared link RPC failure remain actionable failures', async t => {
  replace(t, server, 'requireUser', async () => ({ supabase: {}, user: { id: userId } }));
  replace(t, server, 'createServiceClient', () => ({ rpc: async () => ({ error: { message: 'private fixture failure' } }) }));
  const history = await historyRoute.GET(request('/api/runs', null, 'GET'));
  assert.equal(history.status, 503); assert.match((await history.json()).error, /Supabase/);
  replace(t, server, 'createServerClient', async () => ({ rpc: async name => {
    assert.equal(name, 'polyprompt_read_run_share'); return { error: { message: 'private fixture failure' } };
  } }));
  const shared = await sharedRoute.GET(request('/api/shared/link', null, 'GET'), { params: Promise.resolve({ shareId: 'a'.repeat(64) }) });
  assert.equal(shared.status, 503); assert(!(await shared.text()).includes('private fixture failure'));
});

test('setup readiness preserves missing-table failures instead of accepting an empty HEAD response', async t => {
  replace(t, server, 'createServerClient', async () => null);
  replace(t, server, 'createServiceClient', () => ({ from(name) {
    assert.equal(name, 'polyprompt_profiles'); let head = false;
    const query = { select(_columns, options) { head = Boolean(options?.head); return query; },
      limit: async () => head ? { data: null, error: null, status: 204 } : { data: null, error: { message: 'Missing table' }, status: 404 } };
    return query;
  } }));
  const response = await setupRoute.GET(); const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.schemaReady, false); assert.equal(body.hosted, false);
});

function signedWebhook(t, corrupt = false) {
  const original = process.env.STRIPE_WEBHOOK_SECRET;
  const secret = 'isolated-test-signing-secret';
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  t.after(() => { if (original === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = original; });
  const stripe = new Stripe('isolated-test-client');
  replace(t, billing, 'stripeClient', () => stripe);
  const body = JSON.stringify({ id: 'evt_isolated_fixture', type: 'customer.subscription.updated', created: 1800000000,
    data: { object: { customer: 'cus_isolated_fixture', metadata: { user_id: userId } } } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  return new Request('https://app.invalid/api/billing/webhook', { method: 'POST',
    headers: { 'stripe-signature': signature }, body: corrupt ? body + ' ' : body });
}

test('the webhook rejects a modified signed body before reading billing state', async t => {
  const req = signedWebhook(t, true);
  replace(t, server, 'createServiceClient', () => assert.fail('Invalid signatures must not access billing storage'));
  const response = await webhookRoute.POST(req);
  assert.equal(response.status, 400); assert.match((await response.json()).error, /signature/);
});

test('billing acquires a durable lease before reading Stripe and releases only its own lease', async t => {
  const req = signedWebhook(t);
  const calls = []; let token;
  replace(t, server, 'createServiceClient', () => ({ rpc: async (name, args) => {
    calls.push(name);
    if (name === 'polyprompt_begin_billing_sync') { token = args.p_sync_token; assert.equal(args.p_user_id, userId); return { data: { cached: false }, error: null }; }
    assert.equal(args.p_sync_token, token); assert.equal(args.p_user_id, userId);
    if (name === 'polyprompt_apply_billing_event') { assert.equal(args.p_subscription_id, 'sub_other_active'); assert.equal(args.p_tier, 'pro'); }
    return { error: null };
  } }));
  replace(t, billing, 'currentSubscription', async (_stripe, customer, owner) => {
    assert.equal(customer, 'cus_isolated_fixture'); assert.equal(owner, userId);
    calls.push('read_current_stripe_subscriptions'); return 'sub_other_active';
  });
  assert.equal((await webhookRoute.POST(req)).status, 200);
  assert.deepEqual(calls, ['polyprompt_begin_billing_sync', 'read_current_stripe_subscriptions', 'polyprompt_apply_billing_event', 'polyprompt_release_billing_sync']);
});

test('billing lease contention prevents a stale remote read and remote failure releases the lease', async t => {
  let calls = []; let busy = true;
  replace(t, server, 'createServiceClient', () => ({ rpc: async name => {
    calls.push(name); return { data: { cached: false }, error: busy ? { message: 'Isolated lease contention' } : null };
  } }));
  replace(t, billing, 'currentSubscription', async () => { calls.push('remote_failure'); throw new Error('Isolated private remote failure'); });
  let response = await webhookRoute.POST(signedWebhook(t));
  assert.equal(response.status, 503); assert.deepEqual(calls, ['polyprompt_begin_billing_sync']);
  busy = false; calls = [];
  response = await webhookRoute.POST(signedWebhook(t));
  assert.equal(response.status, 500); assert(!(await response.text()).includes('private remote failure'));
  assert.deepEqual(calls, ['polyprompt_begin_billing_sync', 'remote_failure', 'polyprompt_release_billing_sync']);
});
