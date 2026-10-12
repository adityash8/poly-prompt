import { test, expect } from '@playwright/test';

// Isolated catalog fixtures exercise real controls without contacting providers.
const models = [
  { id: 'openai/gpt-4o-mini', name: 'OpenAI: GPT-4o Mini', provider: 'openai', input_price: 0, output_price: 0, context_length: 128000, supports_seed: true },
  { id: 'google/gemini-2.5-flash', name: 'Google: Gemini 2.5 Flash', provider: 'google', input_price: 0, output_price: 0, context_length: 1000000, supports_seed: true },
  ...Array.from({ length: 20 }, (_, index) => ({ id: `test/${'long-model-id-'.repeat(8)}${index}`, name: `Test ${'long-model-name-'.repeat(8)}${index}`, provider: 'test', input_price: null, output_price: null, context_length: 1000, supports_seed: false })),
];

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4318' ? route.continue() : route.abort());
  await page.route('**/api/models', route => route.fulfill({ json: models }));
  await page.route('**/api/setup', route => route.fulfill({ json: { signedIn: false, hosted: false, auth: false, cloudExecution: false, schemaReady: false, environment: {} } }));
});

test('overview keeps real controls readable in desktop and mobile screenshot artifacts', async ({ page }) => {
  // Isolated catalog fixtures, never an application demo or production response path.
  await page.route('**/api/models', route => route.fulfill({ json: models.slice(0, 2) }));
  for (const viewport of [
    { width: 1280, height: 900, artifact: 'poly-prompt-desktop.png' },
    { width: 390, height: 844, artifact: 'poly-prompt-mobile.png' },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'One prompt. Compare the outputs.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Compare', exact: true })).toHaveAttribute('aria-current', 'page');
    const group = page.getByRole('group', { name: 'Models (2/10 selected)', exact: true });
    await expect(group.getByRole('checkbox')).toHaveCount(2);
    for (const model of models.slice(0, 2)) await expect(group.getByText(model.name, { exact: true })).toBeVisible();
    for (const label of ['OpenRouter key (all models)', 'OpenAI key', 'Anthropic key', 'Google AI key', 'Mistral key']) {
      await expect(page.getByLabel(label, { exact: true })).toHaveValue('');
    }
    for (const label of ['Prompt', 'OpenRouter key (all models)', 'Search live model catalog']) {
      const control = page.getByLabel(label, { exact: true });
      await expect(control).toBeVisible();
      const bounds = await control.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    }
    await expect(page.getByText('Provider usage may incur charges on your key.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run comparison', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(viewport.artifact), fullPage: true });
  }
});

for (const width of [320, 390]) {
  test(`comparison controls remain reachable with native keys and long models at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/runs/new');
    await expect(page.getByRole('group', { name: 'Models (2/10 selected)', exact: true })).toBeVisible();
    await expect(page.getByLabel('Prompt', { exact: true })).toHaveCount(1);
    await page.getByText('Native provider keys and fallback', { exact: true }).click();
    await expect(page.getByLabel('Anthropic key', { exact: true })).toBeVisible();
    await page.getByLabel('Search live model catalog').fill('test');
    const group = page.locator('fieldset').filter({ has: page.getByLabel('Search live model catalog') });
    const lastModel = group.getByRole('checkbox').last();
    await lastModel.scrollIntoViewIfNeeded();
    await lastModel.check();
    await expect(lastModel).toBeChecked();
    for (const label of ['OpenRouter key (all models)', 'Anthropic key', 'Search live model catalog']) {
      const bounds = await page.getByLabel(label, { exact: true }).boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    }
    const run = page.getByRole('button', { name: 'Run comparison', exact: true });
    await run.scrollIntoViewIfNeeded();
    await run.click();
    await expect(page.locator('main p[role="alert"]')).toContainText('Add your OpenRouter key');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('keyboard reaches prompt, native keys and model options in reading order', async ({ page }) => {
  await page.goto('/runs/new');
  await expect(page.getByRole('group', { name: 'Models (2/10 selected)', exact: true })).toBeVisible();
  await page.getByLabel('Run title').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Prompt', { exact: true })).toBeFocused();
  await page.getByLabel('OpenRouter key (all models)').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('summary').filter({ hasText: 'Native provider keys and fallback' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('OpenAI key', { exact: true })).toBeFocused();
  await page.getByLabel('Search live model catalog').focus();
  await page.keyboard.press('Tab');
  const firstModel = page.locator('fieldset').filter({ has: page.getByLabel('Search live model catalog') }).getByRole('checkbox').first();
  await expect(firstModel).toBeFocused();
  expect(await firstModel.evaluate(element => {
    const style = getComputedStyle(element);
    return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
  })).toBe(true);
  await page.keyboard.press('Space');
  await expect(firstModel).not.toBeChecked();
  await page.getByRole('link', { name: 'Templates', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.getByRole('link', { name: 'Templates', exact: true })).toHaveAttribute('aria-current', 'page');
});
