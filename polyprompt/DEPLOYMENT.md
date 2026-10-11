# Parent setup for Poly Prompt

Apply backend setup and deploy only after reviewing the implementation. This working branch is uncommitted and has not changed a live service or CI.

## Application root

The Next.js app is `polyprompt/`, not the outer repository package (which only contains Vercel tooling). Either upload/deploy from the already linked nested app directory with RootDirectory `.` or configure the Git project RootDirectory to `polyprompt`. The parent owns linking and any Vercel mutation.

The nested `vercel.json` defines one daily `/api/maintenance` cron. Both repository and app `.vercelignore` files exclude all `.env*` files, including `.env.local.before-startup-delivery`. `.gitignore` already excludes that private backup. Do not upload or commit runtime environment files.

## Shared Supabase database

The parent has provisioned the isolated `startup-products` project. Its database still needs `supabase/schema.sql` applied. This is the sole canonical setup script; the previous generic-table schema/migration has been replaced.

The transaction creates only `polyprompt_profiles`, `polyprompt_runs`, `polyprompt_evals`, `polyprompt_templates`, `polyprompt_execution_requests`, `polyprompt_run_usage`, and `polyprompt_billing_events`. Functions, policies, indexes and triggers use the `polyprompt_` prefix. Its signup trigger coexists with other products' triggers, and existing auth users are backfilled only into PolyPrompt profiles. It does not rename/drop/delete other products' data, change global default grants, replace their auth trigger, or invoke retention cleanup during installation. Reapplying this identical script preserves data.

RLS and column grants prevent reading another owner's data, changing ownership/paid tier/quota fields, fabricating provider results, or directly publishing links. Service-only execution RPCs verify ownership, lock the profile and run, reserve quota atomically, deduplicate request IDs and update failed-model results. Deleting history does not reset current monthly quota receipts, and recreating a deleted charged UUID cannot reuse its receipt. A living run retains its original receipt across month rollover so retrying a failed model never charges another hosted execution. Anonymous users can call only the scoped capability-share reader; they cannot enumerate private/shared tables.

Stored cleanup functions delete expired free comparisons only when invoked by the configured cron or the owner's history/deletion request. Reads and shared links enforce retention even without cron. `CRON_SECRET` is present locally; confirm its production presence and daily physical cleanup before launch. Pro history is retained until deletion. Personal template deletion is available in the gallery. Shared Auth identity deletion remains an operator action because TextPort shares that identity system.

Do not apply the obsolete generic schema to the shared project. This release does not migrate a legacy database; its data remains in the private prior-runtime backup/project.

## Environment variable names

| Names | Use |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser/server passwordless auth and owner RLS queries |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only execution, sharing, retention and billing persistence |
| `CRON_SECRET` | Authorize scheduled retention cleanup |
| `OPENROUTER_API_KEY` | Optional managed multi-model access |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `MISTRAL_API_KEY` | Optional managed native access/fallback |
| `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | Optional real subscription checkout/portal/webhook |
| `NEXT_PUBLIC_POSTHOG_KEY` | Optional analytics, off until explicit user consent |
| `NEXT_PUBLIC_POSTHOG_HOST` | Optional public analytics ingestion host; defaults to EU ingestion |

Only public Supabase credentials and an optional public analytics key may enter browser bundles. The service role and provider/Stripe/cron keys must stay on the server. Without managed LLM keys, users enter keys for each comparison; there is no persistent key vault. `/setup` exposes only names and presence, never values.

Configure the final site URL and exact `/auth/callback` allowlist entries for production, previews and local development in Supabase. Ensure magic-link email delivery works for intended users; Supabase's default mail delivery has restrictions. The SSR PKCE callback requires opening the link in the browser that requested it. Passwordless verification and auth rate limiting are handled by Supabase. Set the PRD's 30-day maximum session lifetime in Supabase if the project plan supports it; the browser signs out after one hour of inactivity, but this is not server-side session enforcement.

If adding Stripe later, configure a real Pro recurring price and billing portal, and deliver subscription create/update/delete events to `/api/billing/webhook`. Entitlements require signature verification, customer ownership and the configured price. A durable, fenced per-profile lease serializes reading the customer's eligible active subscriptions and updating entitlements, including duplicate and same-second events. An older incomplete checkout cannot cancel a different active subscription. Returning from checkout alone grants nothing. Do not claim billing works until a real test-mode transaction/webhook and cancellation have been exercised.

## Private browser recovery contract

Browser comparisons and queued replay now require ownership proof before recovery. New guest/BYO work carries an explicit `owner_id: null` on the private cache envelope; authenticated tab-only work carries the session owner there. A legacy comparison with `run.user_id` can recover only for that same owner. Unmarked replay can recover only when its complete input matches an authorized cached comparison. Initial unresolved auth exposes neither history nor replay.

This deliberately changes the private cache contract: older records lacking both cache `owner_id` and `run.user_id` cannot be restored automatically, even to the original owner, because authenticated tab-only runs previously produced that ambiguous shape. Reconciliation removes ambiguous and foreign recovery copies while retaining valid guest/current-owner work and offline consent. There is no ownership-claim flow, migration or compatibility fallback. Public `Run`/`Comparison` and HTTP contracts are unchanged; tab-only runs retain no `run.user_id`, so their deletion stays local. Logout and known-owner changes still clear recovery and synchronously tear down the editor.

## Parent live checks

1. Apply the scoped SQL and verify `/setup` reports a ready schema.
2. Configure auth redirects/email, sign in two separate users, and verify cross-owner history/run/export/template/share requests fail.
3. Use a valid BYO provider key to run a two-model comparison, inspect full text/receipts, retry a failed model, reload cloud history, replay, export, publish and revoke a link.
4. Confirm quota reservation/retry receipts and 30-day sharing/90-day retention behavior; verify daily retention is authorized by `CRON_SECRET`.
5. Exercise narrow mobile and keyboard navigation, anonymous share viewing, hostile output escaping and tracking off before opt-in.
6. Check preview/production routing and final environment presence. Recheck framework security releases before publishing; Next.js has announced another security release for October 14, 2026.

Local tests do not send sign-in emails, buy provider calls, create Stripe customers/subscriptions, apply SQL to Supabase, or deploy.
