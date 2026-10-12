# Poly Prompt

Enter one text prompt, fill optional variables, select current models, and compare real provider responses side by side. The app uses Next.js, React, Tailwind and Supabase. OpenRouter covers its live text-model catalog; native OpenAI, Anthropic, Google and Mistral keys can be used directly or after an explicit OpenRouter rejection.

## Run locally

From `polyprompt/`:

```sh
npm ci
npm run dev
```

No managed LLM key is required. Enter your own key in the editor. Keys stay in browser/server request memory, are sent to the selected provider, and are never written to history or browser storage. An invalid key produces a real provider error. There is no mock-response or public demo mode.

Supabase enables passwordless login and private cloud history after the parent applies `supabase/schema.sql` and configures auth redirects/email delivery. Until then, BYO comparisons, tab drafts/history, replay, JSON/CSV export and starter templates remain available. Cloud saving can be disabled explicitly. `/setup` shows configuration names/presence and whether the PolyPrompt schema can be queried.

## First release

- One prompt with literal `{{variable}}` substitution, up to 4,000 characters including expanded values.
- Up to ten distinct models with a combined 10,000 output-token budget. Two current models are selected initially.
- Parallel requests, a 15-second deadline per model, preserved partial results and explicit failed-model retry.
- Full text, actual token counts, latency, returned model/generation ID and finish reason. Receipt costs take priority; catalog estimates are labeled; missing/native costs stay unknown.
- Copy, line-difference highlighting, full-output expansion, JSON/CSV export with spreadsheet formula protection.
- Private cloud save/drafts/history/replay with authenticated ownership and RLS; 50 history rows per page. Guest results stay in the tab, with an opt-in last-five device cache.
- Twelve authored templates, private custom template save/export/delete.
- Explicitly published read-only capability links, free 30-day expiry and revocation. Private runs cannot be enumerated through public table reads.
- Account usage, cloud data export, comparison/template/device deletion, consent controls. Keys and content are excluded from optional analytics.
- Stripe checkout/portal/signed-webhook implementation activates only with real provisioning. No paid entitlement is inferred from a redirect.

Hosted free access permits 50 executions per calendar month and two selected models. BYO comparisons allow up to ten and do not spend hosted quota. Durable run/request receipts prevent duplicate quota debits. A timeout or uncertain network failure may still incur provider charges; explicit retries are new provider requests. Anonymous duplicate suppression is local to one server instance for five minutes.

## Verify

```sh
npm test
npm run test:browser
npm run typecheck
npm run lint
npm run build
node tests/browser-secret-scan.cjs
```

The Node suite exercises provider protocol/receipt/error/timeout behavior, API ownership/error paths, and the exact SQL in a local PostgreSQL engine. Browser tests include an actual live-catalog/invalid-key request; deterministic success fixtures are isolated to tests and labeled there. The browser test server clears environment configuration without editing `.env.local`.

With the production build running locally on port 4319, `node tests/production-smoke.cjs` checks setup, anonymous access denial and login rendering without submitting email, provider or billing requests. The asset scan reports only environment names/presence and whether configured private values occur in browser assets; it never prints values or reads the private backup.

For browser dependencies, use `npx playwright install chromium`. Test artifacts are written under `/tmp/poly-prompt-browser-output`; screenshots are under `/tmp/poly-prompt-*.png`.

See [DEPLOYMENT.md](DEPLOYMENT.md) for parent setup and [MVP_COMPLETE.md](MVP_COMPLETE.md) for limits and follow-on scope. No deployment, database application or live authentication/billing transaction is performed by these checks.
