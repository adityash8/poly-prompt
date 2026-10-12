const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
let db;
const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const model = 'openai/gpt-4o-mini';
const runId = () => crypto.randomUUID();
async function role(name, user = a) { await db.exec(`RESET ROLE; SET ROLE ${name}; SET request.jwt.claim.sub = '${user}';`); }
async function insertRun(user = a, models = [model]) {
  await role('authenticated', user); const id = runId();
  await db.query('INSERT INTO public.polyprompt_runs(id,title,prompt,user_id,models) VALUES($1,$2,$3,$4,$5)', [id, 'Test', 'Prompt', user, models]); return id;
}
async function reserve(id, request = runId(), retry = null, byok = false, user = a) {
  await role('service_role'); const value = await db.query('SELECT public.polyprompt_reserve_execution($1,$2,$3,$4,$5) AS reservation', [user, id, request, retry, byok]);
  return { id, request, reservation: value.rows[0].reservation };
}
async function finish(exec, results = [{ model, actual_model: model, provider: 'openrouter', output: 'Stored output', tokens_in: 3, tokens_out: 4, latency_ms: 5, cost_usd: 0.00001234, cost_source: 'receipt', error: null, error_code: null, generation_id: 'fixture-receipt', finish_reason: 'stop', seed_applied: false, created_at: new Date().toISOString() }]) {
  await role('service_role'); await db.query('SELECT public.polyprompt_finish_execution($1,$2,$3,$4::jsonb)', [a, exec.id, exec.request, JSON.stringify(results)]);
}
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE TABLE public.profiles(id text PRIMARY KEY, untouched text);
    INSERT INTO public.profiles VALUES ('other-product', 'preserved');
    CREATE TABLE public.textport_profiles(id uuid PRIMARY KEY);
    CREATE FUNCTION public.textport_new_user() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN INSERT INTO public.textport_profiles VALUES (NEW.id); RETURN NEW; END; $$;
    CREATE TRIGGER textport_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.textport_new_user();
    INSERT INTO auth.users(id,email) VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','existing@example.invalid');`);
  const schema = fs.readFileSync('supabase/schema.sql', 'utf8');
  await db.exec(schema);
  await db.query('INSERT INTO auth.users(id,email) VALUES ($1,$2),($3,$4)', [a, 'a@example.invalid', b, 'b@example.invalid']);
});
after(async () => { if (db) await db.close(); });

test('scoped schema backfills existing identities, preserves another product, and reapplies without data loss', async () => {
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.polyprompt_profiles')).rows[0].n, 3);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.textport_profiles')).rows[0].n, 3);
  await db.exec(fs.readFileSync('supabase/schema.sql', 'utf8'));
  assert.equal((await db.query('SELECT untouched FROM public.profiles')).rows[0].untouched, 'preserved');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.polyprompt_profiles')).rows[0].n, 3);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='textport_auth_user_created'")).rows[0].n, 1);
});

test('service execution and sharing still reject a different owner and invalid capabilities', async () => {
  const id = await insertRun(a);
  await assert.rejects(reserve(id, runId(), null, true, b), /owner_not_found/);
  await role('service_role');
  await assert.rejects(db.query('SELECT public.polyprompt_set_run_share($1,$2,$3)', [b, id, 'a'.repeat(64)]), /owner_not_found/);
  await assert.rejects(db.query('SELECT public.polyprompt_set_run_share($1,$2,$3)', [a, id, 'short-token']), /invalid_share_token/);
});

test('real RLS hides other users, rejects fabricated results, owner changes, and tier escalation', async () => {
  const id = await insertRun(a); await role('authenticated', b);
  assert.equal((await db.query('SELECT * FROM public.polyprompt_runs WHERE id=$1', [id])).rows.length, 0);
  await assert.rejects(db.query('INSERT INTO public.polyprompt_evals(run_id,model,provider) VALUES($1,$2,$3)', [id, model, 'openrouter']), /permission denied/);
  await assert.rejects(db.query("UPDATE public.polyprompt_profiles SET tier='pro' WHERE id=$1", [b]), /permission denied/);
  await assert.rejects(db.query('UPDATE public.polyprompt_runs SET user_id=$1 WHERE id=$2', [b, id]), /permission denied/);
});
test('real execution RPCs are inaccessible to anonymous and authenticated clients', async () => {
  await role('authenticated'); await assert.rejects(db.query('SELECT public.polyprompt_reserve_execution($1,$2,$3,NULL,false)', [a, runId(), runId()]), /permission denied/);
  await role('anon'); await assert.rejects(db.query('SELECT public.polyprompt_prune_expired_runs(NULL)'), /permission denied/);
});
test('atomic reservation blocks duplicates, finish keeps precise costs, and retries cannot re-execute successes', async () => {
  const id = await insertRun(); const exec = await reserve(id);
  await assert.rejects(reserve(id, exec.request), /execution_busy/);
  await finish(exec);
  const cached = await reserve(id, exec.request); assert.equal(cached.reservation.cached, true);
  await assert.rejects(reserve(id, runId(), [model]), /invalid_retry/);
  await role('authenticated'); const value = (await db.query('SELECT cost_usd FROM public.polyprompt_evals WHERE run_id=$1', [id])).rows[0].cost_usd;
  assert.equal(Number(value), 0.00001234);
});
test('a failed-model retry updates only its result and does not double debit; total failure refunds the quota receipt', async () => {
  const id = await insertRun(); const exec = await reserve(id);
  await finish(exec, [{ model, provider: 'openrouter', output: '', tokens_in: null, tokens_out: null, latency_ms: 15000, cost_usd: null, cost_source: 'unavailable', error: 'Timed out', error_code: 'timeout', generation_id: null, actual_model: null, seed_applied: false, created_at: new Date().toISOString() }]);
  await role('service_role'); assert.equal((await db.query('SELECT charged FROM public.polyprompt_run_usage WHERE run_id=$1', [id])).rows[0].charged, false);
  const retry = await reserve(id, runId(), [model]); await finish(retry);
  await role('service_role'); assert.equal((await db.query('SELECT count(*)::int AS n FROM public.polyprompt_run_usage WHERE run_id=$1', [id])).rows[0].n, 1);
  assert.equal((await db.query('SELECT charged FROM public.polyprompt_run_usage WHERE run_id=$1', [id])).rows[0].charged, true);
});
test('free hosted two-model limit is enforced in the database; BYO permits up to ten', async () => {
  const id = await insertRun(a, [model, 'google/gemini-2.5-flash', 'anthropic/claude-sonnet-4.6']);
  await assert.rejects(reserve(id), /model_limit/); assert.equal((await reserve(id, runId(), null, true)).reservation.cached, false);
});
test('retention maintenance preserves the original receipt for a failed-model retry in a later month', async () => {
  const otherModel = 'google/gemini-2.5-flash';
  const id = await insertRun(a, [model, otherModel]); const exec = await reserve(id);
  const result = (name, error) => ({ model: name, provider: 'openrouter', output: error ? '' : 'Response', error,
    tokens_in: null, tokens_out: null, cost_usd: null, cost_source: 'unavailable', latency_ms: 5,
    seed_applied: false, created_at: new Date().toISOString() });
  await finish(exec, [result(model, null), result(otherModel, 'Timed out')]);
  await role('service_role');
  await db.query("UPDATE public.polyprompt_run_usage SET created_at=now()-interval '32 days' WHERE run_id=$1", [id]);
  await db.query('SELECT public.polyprompt_prune_expired_runs(NULL)');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.polyprompt_run_usage WHERE run_id=$1', [id])).rows[0].n, 1);
  const retry = await reserve(id, runId(), [otherModel]); await finish(retry, [result(otherModel, null)]);
  await role('service_role');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.polyprompt_run_usage WHERE run_id=$1 AND created_at < date_trunc('month',now())", [id])).rows[0].n, 1);
});
test('50 monthly hosted executions cannot be bypassed by deleting comparison history; BYO still works', async () => {
  await role('service_role'); await db.query('UPDATE public.polyprompt_run_usage SET charged=false WHERE user_id=$1', [a]);
  for (let i = 0; i < 50; i++) await db.query('INSERT INTO public.polyprompt_run_usage(run_id,user_id,charged) VALUES($1,$2,true)', [runId(), a]);
  const id = await insertRun(); await assert.rejects(reserve(id), /quota_exceeded/);
  await role('authenticated'); await db.query('DELETE FROM public.polyprompt_runs WHERE user_id=$1', [a]);
  const another = await insertRun(); await assert.rejects(reserve(another), /quota_exceeded/);
  assert.equal((await reserve(another, runId(), null, true)).reservation.cached, false);
});
test('sharing requires a capability, cannot enumerate public runs, strips ownership, expires, and revokes', async () => {
  const id = await insertRun(); const exec = await reserve(id, runId(), null, true); await finish(exec);
  const token = 'a'.repeat(64); await role('service_role');
  await db.query('SELECT public.polyprompt_set_run_share($1,$2,$3)', [a, id, token]);
  await role('anon'); await assert.rejects(db.query('SELECT * FROM public.polyprompt_runs'), /permission denied/);
  const shared = (await db.query('SELECT public.polyprompt_read_run_share($1) AS data', [token])).rows[0].data;
  assert.equal(shared.run.title, 'Test'); assert.equal(shared.evals.length, 1); assert(!Object.hasOwn(shared.run, 'user_id'));
  assert.equal((await db.query('SELECT public.polyprompt_read_run_share($1) AS data', ['b'.repeat(64)])).rows[0].data, null);
  await role('service_role'); await db.query("UPDATE public.polyprompt_runs SET share_expires_at=now()-interval '1 minute' WHERE id=$1", [id]);
  await role('anon'); assert.equal((await db.query('SELECT public.polyprompt_read_run_share($1) AS data', [token])).rows[0].data, null);
  await role('service_role'); await db.query('SELECT public.polyprompt_set_run_share($1,$2,NULL)', [a, id]);
  await role('anon'); assert.equal((await db.query('SELECT public.polyprompt_read_run_share($1) AS data', [token])).rows[0].data, null);
});
test('90-day retention blocks direct reads and physically deletes expired free runs, preserving Pro', async () => {
  const freeId = await insertRun(); const proId = await insertRun(b);
  await role('service_role'); await db.query("UPDATE public.polyprompt_profiles SET tier='pro' WHERE id=$1", [b]);
  await db.query("UPDATE public.polyprompt_runs SET created_at=now()-interval '91 days' WHERE id=ANY($1::uuid[])", [[freeId, proId]]);
  await role('authenticated'); assert.equal((await db.query('SELECT * FROM public.polyprompt_runs WHERE id=$1', [freeId])).rows.length, 0);
  assert.equal((await db.query('DELETE FROM public.polyprompt_runs WHERE id=$1 RETURNING id', [freeId])).rows.length, 0);
  await role('service_role'); await db.query('SELECT public.polyprompt_prune_expired_runs(NULL)');
  assert.equal((await db.query('SELECT * FROM public.polyprompt_runs WHERE id=$1', [freeId])).rows.length, 0);
  assert.equal((await db.query('SELECT * FROM public.polyprompt_runs WHERE id=$1', [proId])).rows.length, 1);
});
test('private templates cannot be read or forged by another user', async () => {
  await role('authenticated'); const id = runId();
  await assert.rejects(db.query('INSERT INTO public.polyprompt_templates(id,title,prompt,created_by) VALUES($1,$2,$3,$4)', [id, 'Private', 'Private prompt', a]), /permission denied/);
  const result = await db.query('INSERT INTO public.polyprompt_templates(title,prompt,created_by) VALUES($1,$2,$3) RETURNING id', ['Private', 'Private prompt', a]);
  await role('authenticated', b); assert.equal((await db.query('SELECT * FROM public.polyprompt_templates WHERE id=$1', [result.rows[0].id])).rows.length, 0);
  assert.equal((await db.query('DELETE FROM public.polyprompt_templates WHERE id=$1 RETURNING id', [result.rows[0].id])).rows.length, 0);
  await assert.rejects(db.query('INSERT INTO public.polyprompt_templates(title,prompt,created_by) VALUES($1,$2,$3)', ['Fake', 'Prompt', a]), /row-level security/);
  await role('authenticated', a);
  assert.equal((await db.query('DELETE FROM public.polyprompt_templates WHERE id=$1 RETURNING id', [result.rows[0].id])).rows.length, 1);
});
test('recreating a deleted UUID cannot reuse its charged quota receipt', async () => {
  await role('service_role');
  const id = (await db.query('SELECT run_id FROM public.polyprompt_run_usage WHERE user_id=$1 AND charged=true LIMIT 1', [a])).rows[0].run_id;
  await db.query('DELETE FROM public.polyprompt_runs WHERE id=$1', [id]);
  await role('authenticated');
  await db.query('INSERT INTO public.polyprompt_runs(id,title,prompt,user_id,models) VALUES($1,$2,$3,$4,$5)', [id, 'Recreated', 'Prompt', a, [model]]);
  await assert.rejects(reserve(id), /reused_run_id/);
});

test('billing lease verifies owner, serializes reconciliation, deduplicates events and rejects stale snapshots', async () => {
  await role('service_role'); await db.query("UPDATE public.polyprompt_profiles SET stripe_customer_id='fixture-customer' WHERE id=$1", [a]);
  const first = runId(); const second = runId();
  await assert.rejects(db.query('SELECT public.polyprompt_begin_billing_sync($1,$2,$3,$4)', [a, 'wrong-customer', 'bad', first]), /billing_owner_mismatch/);
  await db.query('SELECT public.polyprompt_begin_billing_sync($1,$2,$3,$4)', [a, 'fixture-customer', 'active-event', first]);
  await assert.rejects(db.query('SELECT public.polyprompt_begin_billing_sync($1,$2,$3,$4)', [a, 'fixture-customer', 'cancel-event', second]), /billing_busy/);
  await db.query('SELECT public.polyprompt_apply_billing_event($1,$2,$3,$4,$5,$6,$7)', ['active-event', a, 'fixture-customer', 'paid-sub', 'pro', 20, first]);
  const duplicate = (await db.query('SELECT public.polyprompt_begin_billing_sync($1,$2,$3,$4) AS value', [a, 'fixture-customer', 'active-event', second])).rows[0].value;
  assert.equal(duplicate.cached, true);
  await db.query('SELECT public.polyprompt_begin_billing_sync($1,$2,$3,$4)', [a, 'fixture-customer', 'cancel-event', second]);
  await db.query('SELECT public.polyprompt_apply_billing_event($1,$2,$3,$4,$5,$6,$7)', ['cancel-event', a, 'fixture-customer', null, 'free', 20, second]);
  await assert.rejects(db.query('SELECT public.polyprompt_apply_billing_event($1,$2,$3,$4,$5,$6,$7)', ['stale-active', a, 'fixture-customer', 'paid-sub', 'pro', 20, first]), /billing_lease_invalid/);
  assert.equal((await db.query('SELECT tier FROM public.polyprompt_profiles WHERE id=$1', [a])).rows[0].tier, 'free');
  await role('authenticated'); await assert.rejects(db.query('SELECT public.polyprompt_begin_billing_sync($1,$2,$3,$4)', [a, 'fixture-customer', 'forged', first]), /permission denied/);
});

test('expired billing workers cannot overwrite a newer worker or release its lease', async () => {
  await role('service_role'); const old = runId(); const current = runId();
  await db.query('SELECT public.polyprompt_begin_billing_sync($1,$2,$3,$4)', [a, 'fixture-customer', 'old-event', old]);
  await db.query("UPDATE public.polyprompt_profiles SET billing_sync_until=now()-interval '1 second' WHERE id=$1", [a]);
  await db.query('SELECT public.polyprompt_begin_billing_sync($1,$2,$3,$4)', [a, 'fixture-customer', 'current-event', current]);
  await db.query('SELECT public.polyprompt_release_billing_sync($1,$2)', [a, old]);
  await assert.rejects(db.query('SELECT public.polyprompt_apply_billing_event($1,$2,$3,$4,$5,$6,$7)', ['old-event', a, 'fixture-customer', null, 'free', 30, old]), /billing_lease_invalid/);
  await db.query('SELECT public.polyprompt_apply_billing_event($1,$2,$3,$4,$5,$6,$7)', ['current-event', a, 'fixture-customer', 'still-paid', 'pro', 20, current]);
  assert.equal((await db.query('SELECT tier FROM public.polyprompt_profiles WHERE id=$1', [a])).rows[0].tier, 'pro');
});
