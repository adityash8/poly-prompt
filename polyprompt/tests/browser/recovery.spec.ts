import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PostHog } from 'posthog-js';
import type { Comparison } from '../../src/types';

const id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const model = { id: 'openai/gpt-4o-mini', name: 'Isolated recovery fixture', provider: 'openai',
  supports_seed: true, input_price: 0, output_price: 0, context_length: 1000 };
const fixture: Comparison = {
  run: { id, title: 'Isolated recovery fixture',
    prompt: 'Isolated recovery input', resolved_prompt: 'Isolated recovery input', variables: {},
    models: [model.id], seed: null, max_output_tokens: 100, status: 'completed', is_public: false,
    created_at: '2026-10-11T00:00:00Z', updated_at: '2026-10-11T00:00:01Z' },
  results: [{ model: model.id, provider: 'openrouter', output: 'Isolated recovered output', tokens_in: 3, tokens_out: 4,
    cost_usd: 0.00001, cost_source: 'receipt', latency_ms: 20, error: null, error_code: null,
    actual_model: model.id, generation_id: 'isolated-test-receipt', finish_reason: 'stop', seed_applied: true,
    created_at: '2026-10-11T00:00:01Z' }], saved: false,
};

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4318' ? route.continue() : route.abort());
});

test('storage failures keep the export available and never promise tab persistence', async ({ page }) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'poly-prompt-tab-history-v1') throw new DOMException('Isolated test storage failure', 'QuotaExceededError');
      return set.call(this, key, value);
    };
  });
  await page.route('**/api/models', route => route.fulfill({ json: [model] }));
  await page.route('**/api/run', route => route.fulfill({ json: fixture }));
  await page.goto('/runs/new');
  await page.getByLabel('OpenRouter key (all models)').fill('test-only-invalid-key');
  await page.getByRole('button', { name: 'Run comparison', exact: true }).click();
  await expect(page.getByText('Browser storage is unavailable.', { exact: false })).toBeVisible();
  await expect(page.getByText('Kept in this tab.', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Isolated recovered output', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export JSON', exact: true })).toBeEnabled();
});

test('cloud delete failure preserves the local recovery copy, then success removes both', async ({ page }) => {
  await page.addInitScript(comparison => sessionStorage.setItem('poly-prompt-tab-history-v1', JSON.stringify([{ ...comparison, owner_id: null }])), fixture);
  await page.route('**/api/runs?page=0', route => route.fulfill({ json: { runs: [fixture.run], total: 1 } }));
  let deletes = 0;
  await page.route(`**/api/runs/${id}`, route => {
    if (route.request().method() !== 'DELETE') return route.fulfill({ json: fixture.run });
    deletes++;
    return route.fulfill(deletes === 1 ? { status: 503, json: { error: 'Isolated delete failure' } } : { json: { deleted: true } });
  });
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/runs');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Isolated delete failure' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Isolated recovery fixture/ })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('poly-prompt-tab-history-v1') ?? '[]').length)).toBe(1);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('link', { name: /Isolated recovery fixture/ })).toHaveCount(0);
  expect(deletes).toBe(2);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('poly-prompt-tab-history-v1') ?? '[]').length)).toBe(0);
});

test('an in-flight cloud history view refreshes to show its completed output', async ({ page }) => {
  await page.route('**/api/models', route => route.fulfill({ json: [model] }));
  let reads = 0;
  let completed = false;
  await page.route(`**/api/runs/${id}`, route => {
    reads++;
    return route.fulfill({ json: completed ? fixture.run : { ...fixture.run, status: 'running', updated_at: fixture.run.created_at } });
  });
  await page.route(`**/api/runs/${id}/evals`, route => route.fulfill({ json: completed ? fixture.results : [] }));
  await page.goto(`/runs/${id}`);
  await expect(page.getByRole('button', { name: 'Create share link', exact: true })).toBeDisabled();
  completed = true;
  await expect(page.getByText('Isolated recovered output', { exact: true })).toBeVisible({ timeout: 12000 });
  await expect(page.getByRole('button', { name: 'Create share link', exact: true })).toBeEnabled();
  expect(reads).toBeGreaterThan(1);
});

test('completion is observed before results are read, so a stale empty result response cannot stop polling', async ({ page }) => {
  await page.route('**/api/models', route => route.fulfill({ json: [model] }));
  let terminalObserved = false;
  let staleReads = 0;
  await page.route(`**/api/runs/${id}`, async route => {
    await new Promise(resolve => setTimeout(resolve, 60));
    terminalObserved = true;
    await route.fulfill({ json: fixture.run });
  });
  await page.route(`**/api/runs/${id}/evals`, route => {
    if (!terminalObserved) staleReads++;
    return route.fulfill({ json: terminalObserved ? fixture.results : [] });
  });
  await page.goto(`/runs/${id}`);
  await expect(page.getByText('Isolated recovered output', { exact: true })).toBeVisible();
  expect(staleReads).toBe(0);
});

test('the actual analytics SDK stays opted out after reset and can resume only on explicit opt-in', async ({ page }) => {
  // Load the installed SDK and product functions in an isolated harness; no real analytics endpoint is contacted.
  await page.route(/https:\/\/[^/]*posthog\.com\//, route => route.fulfill({ json: {} }));
  await page.route('**/api/models', route => route.fulfill({ json: [model] }));
  await page.goto('/');
  await page.addScriptTag({ path: resolve('node_modules/posthog-js/dist/array.js') });
  const source = (await readFile('src/lib/growthos.js', 'utf8'))
    .replace("import posthog from 'posthog-js';", 'const posthog = window.posthog;')
    .replace('process.env.NEXT_PUBLIC_POSTHOG_HOST', 'undefined')
    .replaceAll('export function', 'function');
  await page.addScriptTag({ content: `${source}\nwindow.testAnalytics = { initGrowthOS, stopGrowthOS };` });
  const state = await page.evaluate(() => {
    const harness = window as unknown as { posthog: PostHog; testAnalytics: { initGrowthOS: (key: string) => void; stopGrowthOS: () => void } };
    harness.testAnalytics.initGrowthOS('isolated-public-analytics-test-key');
    // Playwright is a bot to this SDK. Disable that filter only in this isolated SDK test instance.
    harness.posthog.set_config({ opt_out_useragent_filter: true });
    const enabled = harness.posthog.has_opted_in_capturing();
    const actualEvent = harness.posthog.capture('app_opened', { prompt: 'private prompt' }, { $set_once: { private: '/shared/private-capability' } });
    const propertyNames = Object.keys(actualEvent?.properties ?? {}).sort();
    const hasPublicToken = actualEvent?.properties.token === 'isolated-public-analytics-test-key';
    const hasPersonData = Object.hasOwn(actualEvent ?? {}, '$set_once') || Object.hasOwn(actualEvent ?? {}, '$set');
    const unwantedEvent = harness.posthog.capture('$pageview');
    harness.testAnalytics.stopGrowthOS();
    const disabled = harness.posthog.has_opted_out_capturing();
    const optedOutEvent = harness.posthog.capture('app_opened');
    const stillDisabled = harness.posthog.has_opted_out_capturing();
    harness.testAnalytics.initGrowthOS('isolated-public-analytics-test-key');
    const resumed = harness.posthog.has_opted_in_capturing();
    harness.testAnalytics.stopGrowthOS();
    return { enabled, disabled, stillDisabled, resumed, propertyNames, hasPublicToken, hasPersonData,
      unwantedEventBlocked: unwantedEvent === undefined, optedOutEventBlocked: optedOutEvent === undefined };
  });
  expect(state).toEqual({ enabled: true, disabled: true, stillDisabled: true, resumed: true,
    propertyNames: ['$process_person_profile', 'distinct_id', 'token'], hasPublicToken: true, hasPersonData: false,
    unwantedEventBlocked: true, optedOutEventBlocked: true });
});
