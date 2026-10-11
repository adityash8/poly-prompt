import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// These are isolated test fixtures, never an application demo or production response path.
const fixtureModels = [
  { id: 'openai/gpt-4o-mini', name: 'OpenAI: GPT-4o Mini', provider: 'openai', input_price: 0.00000015, output_price: 0.0000006, context_length: 128000, supports_seed: true },
  { id: 'google/gemini-2.5-flash', name: 'Google: Gemini 2.5 Flash', provider: 'google', input_price: 0.0000003, output_price: 0.0000025, context_length: 1000000, supports_seed: true },
  ...Array.from({ length: 9 }, (_, i) => ({ id: `test/model-${i}`, name: `Test model ${i}`, provider: 'test', input_price: 0, output_price: 0, context_length: 1000, supports_seed: false })),
];
const invalidKey = 'test-only-invalid-provider-key';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4318' ? route.continue() : route.abort());
});

test('zero configuration pages work and isolated provider rejection is shown honestly', async ({ page }) => {
  const errors: string[] = [];
  const tracking: string[] = [];
  page.on('pageerror', error => errors.push(error.name));
  page.on('request', request => { if (request.url().includes('posthog')) tracking.push('tracking request'); });
  await page.route('**/api/models', route => route.fulfill({ json: fixtureModels }));
  await page.route('**/api/run', async route => {
    const body = route.request().postDataJSON();
    const now = new Date().toISOString();
    await route.fulfill({ json: { run: { id: body.id, title: body.title, prompt: body.prompt,
      resolved_prompt: body.prompt, variables: body.variables, models: body.models, seed: body.seed,
      max_output_tokens: body.max_output_tokens, status: 'error', is_public: false, created_at: now, updated_at: now },
      results: body.models.map((model: string) => ({ model, provider: 'openrouter', output: '', tokens_in: null, tokens_out: null,
        cost_usd: null, cost_source: 'unavailable', latency_ms: 0, error: 'The provider rejected the key. Check its permissions and try again.',
        error_code: 'auth', actual_model: null, generation_id: null, finish_reason: null, seed_applied: false, created_at: now })), saved: false } });
  });
  await page.goto('/');
  await expect(page).toHaveTitle(/Poly Prompt/);
  await expect(page.getByRole('heading', { name: 'One prompt. Compare the outputs.' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Models (2/10 selected)', exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Run comparison', exact: true }).click();
  await expect(page.locator('main p[role="alert"]')).toContainText('Add your OpenRouter key');
  await page.getByLabel('OpenRouter key (all models)').fill(invalidKey);
  await page.getByRole('button', { name: 'Run comparison', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Results', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Retry this model' })).toHaveCount(2);
  await expect(page.getByText('The provider rejected the key.', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Export JSON', exact: true }).waitFor();
  const privacy = await page.evaluate(key => ({ localContainsKey: JSON.stringify(localStorage).includes(key), sessionContainsKey: JSON.stringify(sessionStorage).includes(key) }), invalidKey);
  expect(privacy).toEqual({ localContainsKey: false, sessionContainsKey: false });
  expect(errors).toEqual([]); expect(tracking).toEqual([]);
  await page.screenshot({ path: '/tmp/poly-prompt-desktop.png', fullPage: false });
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByText('In this tab', { exact: false }).first()).toBeVisible();
  await page.goto('/login');
  await expect(page.getByText('Cloud sign-in is not configured yet.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send sign-in link' })).toHaveCount(0);
  await page.goto('/shared/not-valid');
  await expect(page.locator('main [role="alert"]')).toContainText('invalid or expired');
});

test('UI renders full fixture results safely, diffs, copies, exports, and replays with no key storage', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/api/models', route => route.fulfill({ json: fixtureModels }));
  await page.route('**/api/run', async route => {
    const body = route.request().postDataJSON();
    const now = new Date().toISOString();
    await route.fulfill({ json: { run: { id: body.id, title: 'Isolated UI fixture', prompt: body.prompt,
      resolved_prompt: body.prompt, variables: body.variables, seed: body.seed, max_output_tokens: body.max_output_tokens,
      models: body.models, status: 'completed', is_public: false, created_at: now, updated_at: now, executed_at: now },
      results: body.models.map((model: string, index: number) => ({ model, actual_model: model, provider: 'openrouter',
        output: index ? 'Test fixture: shared line\nTest fixture: changed line' : 'Test fixture: shared line\n<script>window.fixtureExecuted=true</script>',
        tokens_in: 5, tokens_out: 10, cost_usd: 0.000012, cost_source: 'receipt', latency_ms: 20,
        error: null, error_code: null, generation_id: 'isolated-test-receipt', finish_reason: 'stop', seed_applied: true, created_at: now })), saved: false } });
  });
  await page.goto('/runs/new');
  await page.getByLabel('OpenRouter key (all models)').fill(invalidKey);
  await page.getByRole('button', { name: 'Run comparison', exact: true }).click();
  await expect(page.getByRole('article', { name: /Result from/ })).toHaveCount(2);
  await expect(page.getByText('<script>window.fixtureExecuted=true</script>', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => Object.hasOwn(window, 'fixtureExecuted'))).toBe(false);
  await page.getByLabel('Diff: highlight lines absent from baseline').check();
  await expect(page.getByLabel('Diff baseline')).toBeVisible();
  await expect(page.locator('.bg-yellow-100')).toContainText('changed line');
  await page.getByRole('button', { name: 'Copy', exact: true }).first().click();
  await expect(page.getByText('Copied output', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('<script>');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const download = await downloaded;
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(exported.results).toHaveLength(2);
  expect(JSON.stringify(exported)).not.toContain(invalidKey);
  await page.getByRole('article', { name: /Result from/ }).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/poly-prompt-results.png', fullPage: false });
  await page.getByRole('checkbox', { name: /Keep the last five guest runs/ }).check();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('poly-prompt-offline-history-v1') ?? '[]').length)).toBe(1);
  const originalPrompt = await page.getByLabel('Prompt', { exact: true }).inputValue();
  await page.getByLabel('Prompt', { exact: true }).fill('Edited after completion');
  await page.getByRole('button', { name: 'Edit a copy', exact: true }).click();
  await expect(page.getByLabel('Prompt', { exact: true })).toHaveValue(originalPrompt);
  await expect(page.getByLabel('OpenRouter key (all models)')).toHaveValue('');
  expect(await page.evaluate(() => sessionStorage.getItem('poly-prompt-replay-v1'))).toBeNull();
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await page.getByRole('link', { name: /Isolated UI fixture/ }).click();
  await expect(page.getByText('<script>window.fixtureExecuted=true</script>', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Edit a copy', exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/new/);
  await expect(page.getByLabel('OpenRouter key (all models)')).toHaveValue('');
  expect(await page.getByLabel('Prompt', { exact: true }).inputValue()).toContain('small team');
});

test('variables and ten-model cap are usable on mobile; templates lead to the editor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/models', route => route.fulfill({ json: fixtureModels }));
  await page.goto('/templates');
  await expect(page.getByRole('button', { name: 'Use template', exact: true })).toHaveCount(12);
  await page.getByRole('button', { name: 'Use template', exact: true }).first().click();
  await expect(page.getByLabel('Variable recipient')).toHaveValue('a product lead');
  await expect(page.getByLabel('Variable product')).toBeVisible();
  await page.getByLabel('Search live model catalog').fill('test');
  const models = page.locator('fieldset').filter({ has: page.getByLabel('Search live model catalog') }).getByRole('checkbox');
  for (let i = 2; i < 10; i++) await models.nth(i).check();
  await models.nth(10).click();
  await expect(models.nth(10)).not.toBeChecked();
  await expect(page.locator('main p[role="alert"]')).toContainText('at most 10 models');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/poly-prompt-mobile.png', fullPage: false });
});
