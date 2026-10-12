const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');

// Read-only check of a running production build. Never submits email, provider, billing or database mutations.
(async () => {
  const root = process.argv[2] ?? 'http://127.0.0.1:4319';
  const setupResponse = await fetch(root + '/api/setup');
  const setup = await setupResponse.json();
  assert.equal(setupResponse.status, 200);
  for (const name of ['auth', 'cloudExecution', 'schemaReady', 'hosted', 'signedIn']) assert.equal(typeof setup[name], 'boolean');
  assert.equal(setup.signedIn, false);
  console.log(JSON.stringify({ check: 'production setup', auth: setup.auth, cloudExecution: setup.cloudExecution, schemaReady: setup.schemaReady, hosted: setup.hosted }));
  const history = await fetch(root + '/api/runs'); assert.equal(history.status, setup.auth ? 401 : 503);
  const shared = await fetch(root + '/api/shared/invalid'); assert.equal(shared.status, 404);
  const callback = await fetch(root + '/auth/callback', { redirect: 'manual' });
  assert.equal(callback.status, 307); assert.equal(new URL(callback.headers.get('location')).origin, root);
  const login = await fetch(root + '/login'); assert.equal(login.status, 200);
  assert.equal((await login.text()).includes('Send sign-in link'), setup.auth);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.name));
    await page.goto(root + '/login');
    if (setup.auth) await page.getByRole('button', { name: 'Send sign-in link' }).waitFor();
    else await page.getByRole('link', { name: 'Continue to comparison' }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: private history rejected, invalid share rejected, callback host correct, login renders without client errors. No email sent.');
  } finally { await browser.close(); }
})().catch(() => { console.error('FAIL: read-only production smoke. Sensitive error details suppressed.'); process.exitCode = 1; });
