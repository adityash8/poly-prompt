import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import type { AuthChangeEvent } from '@supabase/supabase-js';
import type { Comparison } from '../../src/types';

const require = createRequire(resolve('package.json'));
const { authenticatedTabComparison, legacyRecovery } = require('./tests/browser-fixtures/legacy-recovery.cjs');
let bundle: string;
let directory: string;
let legacyComparison: Comparison;
let legacyStores: { tab: Record<string, string>; device: Record<string, string> };
const ownerA = 'isolated-owner-a';
const ownerB = 'isolated-owner-b';
const tabKey = 'poly-prompt-tab-history-v1';
const replayKey = 'poly-prompt-replay-v1';
const offlineKey = 'poly-prompt-offline-history-v1';
const fixtureKey = 'isolated-memory-only-key';
const nativeLabels = ['OpenAI key', 'Anthropic key', 'Google AI key', 'Mistral key'];
const model = { id: 'openai/gpt-4o-mini', name: 'Isolated auth fixture', provider: 'openai',
  supports_seed: true, input_price: 0, output_price: 0, context_length: 1000 };
const recoveryFixture: Comparison = { saved: false,
  run: { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', title: 'Isolated prior-owner editor', prompt: 'Isolated prior-owner prompt',
    resolved_prompt: 'Isolated prior-owner prompt', variables: {}, models: [model.id], seed: null, max_output_tokens: 100,
    status: 'completed', is_public: false, created_at: '2026-10-11T00:00:00Z', updated_at: '2026-10-11T00:00:00Z' },
  results: [{ model: model.id, provider: 'openrouter', output: 'Isolated private recovery output', tokens_in: 1, tokens_out: 1,
    cost_usd: null, cost_source: 'unavailable', latency_ms: 0, error: null, error_code: null, actual_model: model.id,
    generation_id: null, finish_reason: 'stop', seed_applied: false, created_at: '2026-10-11T00:00:00Z' }],
};

test.beforeAll(async () => {
  legacyComparison = await authenticatedTabComparison();
  legacyStores = legacyRecovery(legacyComparison);
  // Use Next's installed bundler, with no new dependency or product runtime test hooks.
  const compiled = require('next/dist/compiled/webpack/webpack');
  compiled.init();
  directory = await mkdtemp(join(tmpdir(), 'poly-prompt-auth-harness-'));
  const fixture = resolve('tests/browser-fixtures/auth-harness.tsx');
  const compiler = compiled.webpack({ mode: 'development', target: 'web', devtool: false, entry: fixture,
    output: { path: directory, filename: 'auth-harness.js', publicPath: '/isolated-harness-chunks/' },
    resolve: { extensions: ['.tsx', '.ts', '.js'], alias: {
      '@/lib/supabase$': fixture, 'next/navigation$': fixture, 'next/link$': fixture, '@': resolve('src') } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: resolve('tests/browser-fixtures/tsx-loader.cjs') }] },
    plugins: [new compiled.webpack.DefinePlugin({ 'process.env.NEXT_PUBLIC_POSTHOG_KEY': JSON.stringify('') })],
  });
  await new Promise<void>((done, reject) => compiler.run((error: Error | null, stats: { hasErrors: () => boolean; toString: (options: object) => string }) => {
    compiler.close(() => {});
    if (error || stats?.hasErrors()) reject(error ?? new Error(stats.toString({ all: false, errors: true })));
    else done();
  }));
  bundle = await readFile(join(directory, 'auth-harness.js'), 'utf8');
});
test.afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

async function loadHarness(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4318' ? route.continue() : route.abort());
  await page.route('**/isolated-auth-harness', route => route.fulfill({ contentType: 'text/html', body: '<div id="auth-root"></div>' }));
  await page.route('**/api/models', route => route.fulfill({ json: [model] }));
  await page.route('**/api/setup', route => route.fulfill({ json: { signedIn: true, auth: true, hosted: false, cloudExecution: false, schemaReady: false } }));
  await page.route('**/api/account', route => route.fulfill({ json: { tier: 'free', used: 0, limit: 50, billingAvailable: false } }));
  await page.goto('/isolated-auth-harness');
  await page.addScriptTag({ content: bundle });
  expect(errors).toEqual([]);
}
async function mount(page: Page, account = false) {
  await loadHarness(page);
  await page.evaluate(isAccount => {
    window.authHarness.emit('INITIAL_SESSION', isAccount ? 'isolated-owner-a' : null);
    window.authHarness.mount(isAccount);
  }, account);
  await expect.poll(() => page.evaluate(() => window.authHarness.status().listeners)).toBe(2);
  if (account) await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  else await expect(page.getByRole('button', { name: 'Run comparison', exact: true })).toBeEnabled();
}
async function emit(page: Page, event: AuthChangeEvent, owner: string | null) {
  await page.evaluate(({ event, owner }) => window.authHarness.emit(event, owner), { event, owner });
  await expect(page.getByLabel('Isolated auth identity')).toHaveText(owner ?? 'guest');
}
async function seedPrivateState(page: Page) {
  await page.getByLabel('OpenRouter key (all models)').fill(fixtureKey);
  await page.getByText('Native provider keys and fallback', { exact: true }).click();
  for (const label of nativeLabels) await page.getByLabel(label, { exact: true }).fill(fixtureKey);
  await page.getByLabel('Run title').fill('Isolated prior-owner editor');
  await page.getByLabel('Prompt', { exact: true }).fill('Isolated prior-owner prompt');
  await page.evaluate(comparison => {
    window.authHarness.seedRecovery(comparison);
    sessionStorage.setItem('other-product-data', 'preserve');
    localStorage.setItem('other-product-data', 'preserve');
  }, recoveryFixture);
}
async function storagePresence(page: Page) {
  return page.evaluate(({ tabKey, replayKey, offlineKey }) => ({ tab: sessionStorage.getItem(tabKey) !== null,
    replay: sessionStorage.getItem(replayKey) !== null, offline: localStorage.getItem(offlineKey) !== null,
    otherTab: sessionStorage.getItem('other-product-data') === 'preserve',
    otherDevice: localStorage.getItem('other-product-data') === 'preserve',
    offlineConsent: localStorage.getItem('poly-prompt-offline-consent-v1') === 'yes',
  }), { tabKey, replayKey, offlineKey });
}
async function expectTornDown(page: Page) {
  expect(await storagePresence(page)).toEqual({ tab: false, replay: false, offline: false, otherTab: true, otherDevice: true, offlineConsent: true });
  await expect(page.getByLabel('OpenRouter key (all models)')).toHaveValue('');
  for (const label of nativeLabels) await expect(page.getByLabel(label, { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Run title')).toHaveValue('');
  await expect(page.getByLabel('Prompt', { exact: true })).not.toHaveValue('Isolated prior-owner prompt');
  expect(await page.evaluate(() => window.authHarness.status().unmounts)).toBe(1);
}

test('mounted SIGNED_OUT clears recovery/replay/offline data and tears down the active editor before another owner', async ({ page }) => {
  await mount(page);
  await emit(page, 'SIGNED_IN', ownerA);
  await seedPrivateState(page);
  await emit(page, 'SIGNED_OUT', null);
  await expectTornDown(page);
  await emit(page, 'SIGNED_IN', ownerB);
  await expectTornDown(page);
  expect(await page.evaluate(() => window.authHarness.status().snapshots.at(-1))).toEqual({ owner: ownerB, recoveryPresent: false, keyPresent: false });
  // New guest/BYO work remains usable after logout, with no credential inherited from the prior owner.
  await page.getByRole('button', { name: 'Run comparison', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Add your OpenRouter key');
});

test('a direct owner change remounts the editor and clears data before the new identity is rendered', async ({ page }) => {
  await mount(page);
  await emit(page, 'INITIAL_SESSION', ownerA);
  await seedPrivateState(page);
  await emit(page, 'SIGNED_IN', ownerB);
  await expectTornDown(page);
  expect(await page.evaluate(() => window.authHarness.status().snapshots.at(-1))).toEqual({ owner: ownerB, recoveryPresent: false, keyPresent: false });
});

test('anonymous initialization and same-owner auth refresh preserve genuine guest/BYO work', async ({ page }) => {
  await mount(page);
  await seedPrivateState(page);
  await emit(page, 'INITIAL_SESSION', null);
  await emit(page, 'SIGNED_IN', ownerA);
  await emit(page, 'TOKEN_REFRESHED', ownerA);
  await emit(page, 'SIGNED_IN', ownerA);
  expect(await storagePresence(page)).toEqual({ tab: true, replay: true, offline: true, otherTab: true, otherDevice: true, offlineConsent: true });
  await expect(page.getByLabel('OpenRouter key (all models)')).toHaveValue(fixtureKey);
  for (const label of nativeLabels) await expect(page.getByLabel(label, { exact: true })).toHaveValue(fixtureKey);
  await expect(page.getByLabel('Run title')).toHaveValue('Isolated prior-owner editor');
  expect(await page.evaluate(() => window.authHarness.status().unmounts)).toBe(0);
});

test('a comparison response arriving after auth teardown cannot restore the old owner’s recovery data', async ({ page }) => {
  await mount(page);
  await emit(page, 'SIGNED_IN', ownerA);
  await seedPrivateState(page);
  await page.evaluate(() => { window.heldExecution = window.authHarness.holdExecution(); });
  await page.getByRole('button', { name: 'Run comparison', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.heldExecution.submitted())).toBe(true);
  await emit(page, 'SIGNED_OUT', null);
  await expectTornDown(page);
  await emit(page, 'SIGNED_IN', ownerB);
  const settled = await page.evaluate(async () => {
    window.heldExecution.release();
    await new Promise(resolve => setTimeout(resolve, 0));
    return { aborted: window.heldExecution.aborted(), recoveryPresent: sessionStorage.getItem('poly-prompt-tab-history-v1') !== null };
  });
  expect(settled).toEqual({ aborted: true, recoveryPresent: false });
  await expectTornDown(page);
});

test('auth teardown finishes inside the subscription before an immediately arriving response or identity change', async ({ page }) => {
  await mount(page);
  await emit(page, 'SIGNED_IN', ownerA);
  await seedPrivateState(page);
  await page.evaluate(() => { window.heldExecution = window.authHarness.holdExecution(); });
  await page.getByRole('button', { name: 'Run comparison', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.heldExecution.submitted())).toBe(true);
  const transition = await page.evaluate(async () => {
    window.authHarness.emit('SIGNED_OUT', null);
    const immediate = { unmounts: window.authHarness.status().unmounts,
      keyPresent: Boolean(document.querySelector<HTMLInputElement>('#key-openrouter')?.value),
      aborted: window.heldExecution.aborted() };
    window.authHarness.emit('SIGNED_IN', 'isolated-owner-b');
    window.heldExecution.release();
    await new Promise(resolve => setTimeout(resolve, 0));
    return { immediate, recovered: sessionStorage.getItem('poly-prompt-tab-history-v1') !== null };
  });
  expect(transition).toEqual({ immediate: { unmounts: 1, keyPresent: false, aborted: true }, recovered: false });
  await expectTornDown(page);
});

test('account sign-out uses local scope and relies on the mounted subscription for a single cleanup', async ({ page }) => {
  await mount(page, true);
  await emit(page, 'INITIAL_SESSION', ownerA);
  await page.evaluate(({ tabKey, replayKey, offlineKey }) => {
    sessionStorage.setItem(tabKey, 'isolated'); sessionStorage.setItem(replayKey, 'isolated'); localStorage.setItem(offlineKey, 'isolated');
    const remove = Storage.prototype.removeItem;
    const calls: string[] = [];
    Storage.prototype.removeItem = function (key) { calls.push(key); return remove.call(this, key); };
    Object.assign(window, { storageRemovals: calls });
  }, { tabKey, replayKey, offlineKey });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByLabel('Isolated auth identity')).toHaveText('guest');
  await expect.poll(() => page.evaluate(() => window.authHarness.status().signOutScopes)).toEqual(['local']);
  expect(await page.evaluate(() => (window as unknown as { storageRemovals: string[] }).storageRemovals)).toEqual([tabKey, replayKey, offlineKey]);
  expect(await page.evaluate(() => window.authHarness.status().paths)).toEqual(['/']);
  expect(await page.evaluate(() => window.authHarness.status().unmounts)).toBe(1);
});

test('failed local sign-out preserves the current owner and recovery data', async ({ page }) => {
  await mount(page, true);
  await emit(page, 'INITIAL_SESSION', ownerA);
  await page.evaluate(({ tabKey, replayKey, offlineKey }) => {
    sessionStorage.setItem(tabKey, 'isolated'); sessionStorage.setItem(replayKey, 'isolated'); localStorage.setItem(offlineKey, 'isolated');
    window.authHarness.failSignOut();
  }, { tabKey, replayKey, offlineKey });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Sign-out failed');
  await expect(page.getByLabel('Isolated auth identity')).toHaveText(ownerA);
  const presence = await storagePresence(page);
  expect(presence.tab && presence.replay && presence.offline).toBe(true);
  expect(await page.evaluate(() => window.authHarness.status().unmounts)).toBe(0);
  expect(await page.evaluate(() => window.authHarness.status().paths)).toEqual([]);
});

test('authenticated tab-only BYO recovery keeps ownership without requiring a cloud delete', async ({ page }) => {
  await mount(page);
  await emit(page, 'SIGNED_IN', ownerA);
  await page.route('**/api/runs?page=0', route => route.fulfill({ status: 503, json: { error: 'Isolated cloud history unavailable' } }));
  let cloudDeletes = 0;
  await page.route(`**/api/runs/${recoveryFixture.run.id}`, route => {
    if (route.request().method() === 'DELETE') cloudDeletes++;
    return route.fulfill({ status: 503, json: { error: 'Isolated cloud record unavailable' } });
  });
  await page.evaluate(comparison => {
    window.authHarness.seedRecovery(comparison);
    window.authHarness.mount(false, 'history');
  }, recoveryFixture);
  await expect(page.getByRole('link', { name: new RegExp(recoveryFixture.run.title) })).toBeVisible();
  expect(await page.evaluate(() => {
    const cached = JSON.parse(sessionStorage.getItem('poly-prompt-tab-history-v1') ?? '[]')[0];
    return { owner: cached.owner_id, cloudOwned: Object.hasOwn(cached.run, 'user_id') };
  })).toEqual({ owner: ownerA, cloudOwned: false });
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('link', { name: new RegExp(recoveryFixture.run.title) })).toHaveCount(0);
  expect(cloudDeletes).toBe(0);
  expect(await page.evaluate(() => window.authHarness.recovery().length)).toBe(0);
});

test('startup history removes prior-owner data from a mixed cache while preserving genuine guest recovery', async ({ page }) => {
  await loadHarness(page);
  await page.route('**/api/runs?page=0', route => route.fulfill({ status: 503, json: { error: 'Isolated cloud history unavailable' } }));
  const guest = { ...recoveryFixture, owner_id: null, run: { ...recoveryFixture.run,
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', title: 'Isolated genuine guest recovery' } };
  await page.evaluate(({ prior, guest }) => {
    window.authHarness.automaticInitial(false);
    const rows = [{ ...prior, run: { ...prior.run, user_id: 'isolated-owner-a' } }, guest];
    sessionStorage.setItem('poly-prompt-tab-history-v1', JSON.stringify(rows));
    localStorage.setItem('poly-prompt-offline-history-v1', JSON.stringify(rows));
    localStorage.setItem('poly-prompt-offline-consent-v1', 'yes');
    const { title, prompt, variables, models, seed, max_output_tokens } = guest.run;
    sessionStorage.setItem('poly-prompt-replay-v1', JSON.stringify({ title, prompt, variables, models, seed, max_output_tokens, owner_id: null }));
    window.authHarness.mount(false, 'history');
  }, { prior: recoveryFixture, guest });
  await expect.poll(() => page.evaluate(() => window.authHarness.status().listeners)).toBeGreaterThan(0);
  expect(await page.getByRole('heading', { name: guest.run.title, exact: true }).count()).toBe(0);
  await emit(page, 'INITIAL_SESSION', null);
  await expect(page.getByRole('link', { name: new RegExp(guest.run.title) })).toBeVisible();
  await expect(page.getByRole('heading', { name: recoveryFixture.run.title, exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.authHarness.recovery().map(item => item.run.id))).toEqual([guest.run.id]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('poly-prompt-offline-history-v1') ?? '[]').map((item: Comparison) => item.run.id))).toEqual([guest.run.id]);
  expect((await storagePresence(page)).replay).toBe(true);
});

for (const initialOwner of [null, ownerB]) {
  test(`mixed startup history preserves explicit guest/current-owner proof and rejects ambiguous replay for ${initialOwner ?? 'guest'}`, async ({ page }) => {
    await loadHarness(page);
    await page.route('**/api/runs?page=0', route => route.fulfill({ status: 503, json: { error: 'Isolated cloud history unavailable' } }));
    const guest = { ...recoveryFixture, owner_id: null, run: { ...recoveryFixture.run,
      id: 'explicit-mixed-guest', title: 'Isolated explicit mixed guest', prompt: 'Isolated explicit guest prompt' } };
    const ownLegacy = { ...recoveryFixture, run: { ...recoveryFixture.run, user_id: ownerB,
      id: 'owned-mixed-legacy', title: 'Isolated mixed owned legacy' } };
    const ownCurrent = { ...recoveryFixture, owner_id: ownerB, run: { ...recoveryFixture.run,
      id: 'owned-mixed-current', title: 'Isolated mixed owned current' } };
    const foreign = { ...recoveryFixture, owner_id: ownerA, run: { ...recoveryFixture.run,
      id: 'foreign-mixed-current', title: 'Isolated mixed foreign current' } };
    await page.evaluate(({ rows, replay }) => {
      window.authHarness.automaticInitial(false);
      sessionStorage.setItem('poly-prompt-tab-history-v1', JSON.stringify(rows));
      localStorage.setItem('poly-prompt-offline-history-v1', JSON.stringify(rows));
      localStorage.setItem('poly-prompt-offline-consent-v1', 'yes');
      sessionStorage.setItem('poly-prompt-replay-v1', replay);
      window.authHarness.mount(false, 'history');
    }, { rows: [guest, ownLegacy, ownCurrent, foreign, legacyComparison], replay: legacyStores.tab[replayKey] });
    await expect(page.getByText('Checking your session…', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.authHarness.recovery().length)).toBe(0);
    await emit(page, 'INITIAL_SESSION', initialOwner);
    const allowed = initialOwner === null ? [guest] : [guest, ownLegacy, ownCurrent];
    for (const row of allowed) await expect(page.getByRole('link', { name: new RegExp(row.run.title) })).toBeVisible();
    await expect(page.getByText(legacyComparison.run.title, { exact: true })).toHaveCount(0);
    await expect(page.getByText(foreign.run.title, { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => window.authHarness.recovery().map(item => item.run.id))).toEqual(allowed.map(row => row.run.id));
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('poly-prompt-offline-history-v1') ?? '[]')
      .map((row: Comparison) => row.run.id))).toEqual(allowed.map(row => row.run.id));
    expect((await storagePresence(page)).replay).toBe(false);
    expect((await storagePresence(page)).offlineConsent).toBe(true);
  });
}

for (const view of ['editor', 'history', 'detail'] as const) {
  test(`new authenticated tab-only ${view} recovers the actual route response for the same owner after reload`, async ({ page }) => {
    await mount(page);
    await emit(page, 'SIGNED_IN', ownerA);
    await page.evaluate(comparison => window.authHarness.seedRecovery(comparison), legacyComparison);
    expect(await page.evaluate(() => {
      const cached = JSON.parse(sessionStorage.getItem('poly-prompt-tab-history-v1') ?? '[]')[0];
      return { owner: cached.owner_id, cloudOwned: Object.hasOwn(cached.run, 'user_id') };
    })).toEqual({ owner: ownerA, cloudOwned: false });
    await loadHarness(page);
    await page.route('**/api/runs?page=0', route => route.fulfill({ status: 503, json: { error: 'Isolated cloud history unavailable' } }));
    await page.evaluate(view => { window.authHarness.automaticInitial(false); window.authHarness.mount(false, view); }, view);
    await expect(page.getByText('Checking your session…', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.authHarness.recovery().length)).toBe(0);
    expect((await storagePresence(page)).replay).toBe(true);
    await emit(page, 'INITIAL_SESSION', ownerA);
    expect(await page.evaluate(() => window.authHarness.recovery().map(item => item.run.id))).toEqual([legacyComparison.run.id]);
    expect((await storagePresence(page)).offline).toBe(true);
    if (view === 'history') await expect(page.getByRole('link', { name: new RegExp(legacyComparison.run.title) })).toBeVisible();
    else await expect(page.getByLabel('Prompt', { exact: true })).toHaveValue(legacyComparison.run.prompt);
    if (view === 'detail') await expect(page.getByText(legacyComparison.results[0].output, { exact: true })).toBeVisible();
    if (view !== 'editor') expect((await storagePresence(page)).replay).toBe(true);
    await emit(page, 'TOKEN_REFRESHED', ownerA);
    expect(await page.evaluate(() => window.authHarness.recovery().length)).toBe(1);
  });

  for (const initialOwner of [null, ownerB, ownerA]) {
    test(`legacy authenticated tab-only ${view} rejects ambiguous recovery after initial ${initialOwner ?? 'guest'}`, async ({ page }) => {
      await loadHarness(page);
      await page.route('**/api/runs?page=0', route => route.fulfill({ status: 503, json: { error: 'Isolated cloud history unavailable' } }));
      await page.route(`**/api/runs/${legacyComparison.run.id}`, route => route.fulfill({ status: 403,
        json: { error: 'Isolated ambiguous recovery rejected' } }));
      await page.evaluate(({ stores, view }) => {
        window.authHarness.automaticInitial(false);
        for (const [key, value] of Object.entries(stores.tab)) sessionStorage.setItem(key, value);
        for (const [key, value] of Object.entries(stores.device)) localStorage.setItem(key, value);
        sessionStorage.setItem('other-product-data', 'preserve'); localStorage.setItem('other-product-data', 'preserve');
        window.authHarness.mount(false, view);
      }, { stores: legacyStores, view });
      await expect(page.getByRole('status', { name: '' }).filter({ hasText: 'Checking your session' })).toBeVisible();
      expect(await page.evaluate(() => window.authHarness.recovery().length)).toBe(0);
      expect((await storagePresence(page)).replay).toBe(true);
      await expect(page.getByText(legacyComparison.results[0].output, { exact: true })).toHaveCount(0);
      await emit(page, 'INITIAL_SESSION', initialOwner);
      expect.soft(await storagePresence(page)).toEqual({ tab: false, replay: false, offline: false,
        otherTab: true, otherDevice: true, offlineConsent: true });
      expect.soft(await page.evaluate(() => window.authHarness.recovery().length)).toBe(0);
      await expect.soft(page.getByText(legacyComparison.run.title, { exact: true })).toHaveCount(0);
      await expect.soft(page.getByText(legacyComparison.results[0].output, { exact: true })).toHaveCount(0);
      if (view === 'editor') {
        await expect.soft(page.getByLabel('Prompt', { exact: true })).not.toHaveValue(legacyComparison.run.prompt);
        await expect.soft(page.getByLabel('Run title')).not.toHaveValue(legacyComparison.run.title);
      }
      if (view === 'detail') await expect.soft(page.getByRole('alert')).toContainText('ambiguous recovery rejected');
    });
  }

  for (const initialOwner of [null, ownerB, ownerA]) {
    test(`startup ${view} protects owner A recovery until INITIAL_SESSION resolves as ${initialOwner ?? 'guest'}`, async ({ page }) => {
      await loadHarness(page);
      await page.route('**/api/runs?page=0', route => route.fulfill({ status: 503, json: { error: 'Isolated cloud history unavailable' } }));
      await page.route(`**/api/runs/${recoveryFixture.run.id}`, route => route.fulfill({ status: initialOwner === ownerA ? 503 : 403,
        json: { error: initialOwner === ownerA ? 'Isolated cloud storage unavailable' : 'Isolated ownership rejection' } }));
      const owned = { ...recoveryFixture, run: { ...recoveryFixture.run, user_id: ownerA } };
      await page.evaluate(({ comparison, view }) => {
        window.authHarness.automaticInitial(false);
        sessionStorage.setItem('poly-prompt-tab-history-v1', JSON.stringify([comparison]));
        localStorage.setItem('poly-prompt-offline-history-v1', JSON.stringify([comparison]));
        localStorage.setItem('poly-prompt-offline-consent-v1', 'yes');
        const { title, prompt, variables, models, seed, max_output_tokens } = comparison.run;
        sessionStorage.setItem('poly-prompt-replay-v1', JSON.stringify({ title, prompt, variables, models, seed, max_output_tokens }));
        sessionStorage.setItem('other-product-data', 'preserve'); localStorage.setItem('other-product-data', 'preserve');
        window.authHarness.mount(false, view);
      }, { comparison: owned, view });
      await expect.poll(() => page.evaluate(() => window.authHarness.status().listeners)).toBeGreaterThan(0);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      // Check the actual mounted views and cache API, not an extracted callback or helper imitation.
      expect.soft(await page.getByLabel('Isolated auth identity').count()).toBe(0);
      expect.soft(await page.evaluate(() => window.authHarness.recovery().length)).toBe(0);
      expect.soft(await page.getByText(owned.run.title, { exact: true }).count()).toBe(0);
      expect.soft(await page.getByText(owned.results[0].output, { exact: true }).count()).toBe(0);
      expect.soft(await page.evaluate(() => sessionStorage.getItem('poly-prompt-replay-v1') !== null)).toBe(true);
      await emit(page, 'INITIAL_SESSION', initialOwner);
      if (initialOwner !== ownerA) {
        expect(await storagePresence(page)).toEqual({ tab: false, replay: false, offline: false, otherTab: true, otherDevice: true, offlineConsent: true });
        expect(await page.evaluate(() => window.authHarness.recovery().length)).toBe(0);
        await expect(page.getByText(owned.run.title, { exact: true })).toHaveCount(0);
        await expect(page.getByText(owned.results[0].output, { exact: true })).toHaveCount(0);
        if (view === 'editor') await expect(page.getByLabel('Prompt', { exact: true })).not.toHaveValue(owned.run.prompt);
        if (view === 'detail') await expect(page.getByRole('alert')).toContainText('ownership rejection');
      } else {
        expect(await page.evaluate(() => window.authHarness.recovery().map(item => item.run.id))).toEqual([owned.run.id]);
        expect((await storagePresence(page)).offline).toBe(true);
        if (view === 'history') await expect(page.getByRole('link', { name: /Isolated prior-owner editor/ })).toBeVisible();
        else await expect(page.getByLabel('Prompt', { exact: true })).toHaveValue(owned.run.prompt);
        if (view === 'detail') await expect(page.getByText(owned.results[0].output, { exact: true })).toBeVisible();
        if (view !== 'editor') expect((await storagePresence(page)).replay).toBe(true);
        await emit(page, 'TOKEN_REFRESHED', ownerA);
        expect(await page.evaluate(() => window.authHarness.recovery().length)).toBe(1);
      }
    });
  }

  test(`startup ${view} preserves valid guest recovery after an initial anonymous session`, async ({ page }) => {
    await loadHarness(page);
    await page.route('**/api/runs?page=0', route => route.fulfill({ status: 401, json: { error: 'Isolated guest history' } }));
    await page.route(`**/api/runs/${recoveryFixture.run.id}`, route => route.fulfill({ status: 401, json: { error: 'Isolated guest detail' } }));
    await page.evaluate(({ comparison, view }) => {
      window.authHarness.automaticInitial(false);
      sessionStorage.setItem('poly-prompt-tab-history-v1', JSON.stringify([comparison]));
      localStorage.setItem('poly-prompt-offline-history-v1', JSON.stringify([comparison]));
      localStorage.setItem('poly-prompt-offline-consent-v1', 'yes');
      const { title, prompt, variables, models, seed, max_output_tokens } = comparison.run;
      sessionStorage.setItem('poly-prompt-replay-v1', JSON.stringify({ title, prompt, variables, models, seed, max_output_tokens, owner_id: null }));
      window.authHarness.mount(false, view);
    }, { comparison: { ...recoveryFixture, owner_id: null }, view });
    await expect.poll(() => page.evaluate(() => window.authHarness.status().listeners)).toBeGreaterThan(0);
    await emit(page, 'INITIAL_SESSION', null);
    expect(await page.evaluate(() => window.authHarness.recovery().length)).toBe(1);
    if (view === 'history') await expect(page.getByRole('link', { name: /Isolated prior-owner editor/ })).toBeVisible();
    else await expect(page.getByLabel('Prompt', { exact: true })).toHaveValue(recoveryFixture.run.prompt);
    if (view === 'detail') await expect(page.getByText(recoveryFixture.results[0].output, { exact: true })).toBeVisible();
  });
}

for (const initialOwner of [null, ownerB]) {
  test(`startup rejects an owner A replay without history for ${initialOwner ?? 'guest'}`, async ({ page }) => {
    await loadHarness(page);
    await page.evaluate(comparison => {
      window.authHarness.automaticInitial(false);
      const { title, prompt, variables, models, seed, max_output_tokens } = comparison.run;
      sessionStorage.setItem('poly-prompt-replay-v1', JSON.stringify({ title, prompt, variables, models, seed, max_output_tokens, owner_id: 'isolated-owner-a' }));
      localStorage.setItem('poly-prompt-offline-history-v1', '[]');
      window.authHarness.mount();
    }, recoveryFixture);
    await expect.poll(() => page.evaluate(() => window.authHarness.status().listeners)).toBeGreaterThan(0);
    await emit(page, 'INITIAL_SESSION', initialOwner);
    await expect(page.getByLabel('Prompt', { exact: true })).not.toHaveValue(recoveryFixture.run.prompt);
    expect((await storagePresence(page)).replay).toBe(false);
    expect((await storagePresence(page)).offline).toBe(false);
  });
}
