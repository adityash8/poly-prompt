# First release implementation status

The source implements real server-mediated multi-model comparison and the associated save/replay/export/share/template flows. It is ready for parent review, schema application, valid-key verification and deployment. It is not a claim of live production readiness.

## PRD decisions

- Free hosted quota is 50 executed comparisons per calendar month. History separately shows 50 rows per page, with free 90-day retention; deleting history cannot recover current monthly quota.
- Two models are selected initially to match free hosted access. BYO keys allow up to ten; paid hosted access is enabled only by verified provisioning/entitlements.
- Free sharing lasts 30 days, following the functional requirement despite conflicting Pro-only wording. Pro links have no automatic expiry and remain revocable.
- The input limit follows the 4,000-character acceptance criterion rather than the separate 4K-token statement. Expanded variables count toward it. Output budget totals at most 10,000 tokens across models.
- Model changes require clicking Run. They never trigger an automatic billable request.
- Persistent provider-key storage/vault is replaced by memory-only keys as explicitly requested. Prompts and outputs can be saved; keys cannot.
- Personal templates are available to signed-in users in this BYO release. The PRD's Pro-only template restriction is not enforced; paid hosted entitlement checks still require verified Stripe provisioning.
- Providers return different receipt data. Missing costs/tokens are unknown, never invented. Native costs are unknown; OpenRouter estimates use its current input/output prices and are labeled.
- A total failure releases the app's quota receipt. It cannot refund provider billing. Unknown network/timeout outcomes are never automatically retried or sent to a fallback provider.

## Operational limits

Supabase variables are provisioned, but cloud persistence needs the parent to apply the scoped SQL and exercise real auth/history. Valid managed LLM and Stripe keys are absent. `CRON_SECRET` is now present locally; the parent must confirm production provisioning and exercise retention after deployment. BYO works independently of managed-provider/Stripe setup; successful billable completions require the user's valid key.

Guest duplicate suppression is per server instance for five minutes. Authenticated saved comparisons use durable DB run/request receipts. An interrupted server process can leave a run reserved/running; the app instructs the user to inspect history before replay, and does not automatically retry an uncertain charge.

Browser idle logout signs out only the current session and removes tab/offline recovery copies and queued replay input, as does manual sign-out. Manual sign-out remains available before schema setup. A 30-day/server-enforced session lifetime, auth email delivery/rate-limit policy and shared identity deletion require Supabase/operator configuration. Cloud data export includes profile fields, personal templates, retained usage receipts and comparison results. Comparison/template/device deletion and link revocation work in the app; identity/profile deletion is handled by the operator to avoid affecting TextPort without authorization.

History filters are explicit per-page filters; the history API additionally accepts prompt search. Device caching is opt-in and retains up to five guest comparisons until cleared. Diff is line-membership highlighting against a selected baseline, not a semantic score.

Private browser recovery requires an explicit guest cache marker or proof of the current owner. New tab-only ownership is stored on the private envelope, preserving local deletion and the public run/API contracts. Deliberate cache-contract change: older records without both cache `owner_id` and `run.user_id` cannot restore automatically, including to their original owner. Ambiguous/foreign records and unprovable replay are discarded; proven same-owner records, explicit guest recovery and authorized mixed-cache work survive. No migration, ownership claim or compatibility fallback is provided. The initial-session gate and synchronous logout/late-response guards remain required.

## Follow-on scope

Post-MVP: CSV batch/matrix testing, manual rubric scoring, auto-judge, Team/SSO/seat/org-key management, realtime collaboration, persistent encrypted key vault (only if separately authorized), community template moderation, screenshot export, public comparison SEO pages, admin failure alerts, aggregate token-spend reporting and 80%-quota alerts. Over-quota requests offer BYO or waiting for the next month; there is no automatic billable queue.

Dark-mode toggle, swipe navigation, first-run confetti, cross-page combined search/date filtering and ISR shared-page caching are also follow-on polish. Shared responses remain uncached so revocation and expiry apply immediately. No fabricated community counts, results, metrics or paid checkout success are shipped.

Verification commands and exact current results are recorded in the parent completion report. No commits, pushes, merges, deployments, live schema application or CI changes were performed.
