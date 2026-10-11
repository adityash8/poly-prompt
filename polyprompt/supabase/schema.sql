-- PolyPrompt first release. Canonical, additive setup for the shared startup-products project.
-- Parent applies this transaction. It neither reads nor changes other products' tables/policies/triggers.
-- Reapplying the same script preserves PolyPrompt data. No live cleanup runs during setup.
BEGIN;

CREATE TABLE IF NOT EXISTS public.polyprompt_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  avatar_url text,
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'team')),
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text,
  billing_event_time bigint NOT NULL DEFAULT 0,
  billing_sync_token uuid,
  billing_sync_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.polyprompt_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.polyprompt_profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  prompt text NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 4000),
  resolved_prompt text NOT NULL DEFAULT '' CHECK (char_length(resolved_prompt) <= 4000),
  variables jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(variables) = 'object'),
  models text[] NOT NULL CHECK (cardinality(models) BETWEEN 1 AND 10),
  seed integer CHECK (seed >= 0),
  max_output_tokens integer NOT NULL DEFAULT 1000 CHECK (max_output_tokens >= 1 AND max_output_tokens * cardinality(models) <= 10000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'running', 'completed', 'error')),
  is_public boolean NOT NULL DEFAULT false,
  share_id text UNIQUE CHECK (share_id ~ '^[a-f0-9]{64}$'),
  share_expires_at timestamptz,
  executed_at timestamptz,
  active_request uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.polyprompt_evals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.polyprompt_runs(id) ON DELETE CASCADE,
  model text NOT NULL,
  actual_model text,
  provider text NOT NULL,
  output text NOT NULL DEFAULT '',
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  tokens_in integer CHECK (tokens_in >= 0),
  tokens_out integer CHECK (tokens_out >= 0),
  cost_usd numeric(20,12) CHECK (cost_usd >= 0),
  cost_source text NOT NULL DEFAULT 'unavailable' CHECK (cost_source IN ('receipt', 'estimate', 'unavailable')),
  error text,
  error_code text,
  generation_id text,
  finish_reason text,
  seed_applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, model)
);
CREATE TABLE IF NOT EXISTS public.polyprompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.polyprompt_profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description text,
  prompt text NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 4000),
  category text NOT NULL DEFAULT 'general',
  variables jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(variables) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.polyprompt_execution_requests (
  run_id uuid NOT NULL REFERENCES public.polyprompt_runs(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  complete boolean NOT NULL DEFAULT false,
  PRIMARY KEY (run_id, request_id)
);
-- No run FK: deleting history must not reset the monthly hosted execution allowance.
CREATE TABLE IF NOT EXISTS public.polyprompt_run_usage (
  run_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.polyprompt_profiles(id) ON DELETE CASCADE,
  charged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.polyprompt_billing_events (
  event_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS polyprompt_runs_owner_date ON public.polyprompt_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS polyprompt_usage_owner_month ON public.polyprompt_run_usage(user_id, created_at);
CREATE INDEX IF NOT EXISTS polyprompt_templates_owner ON public.polyprompt_templates(created_by);

ALTER TABLE public.polyprompt_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polyprompt_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polyprompt_evals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polyprompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polyprompt_execution_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polyprompt_run_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polyprompt_billing_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.polyprompt_profiles, public.polyprompt_runs, public.polyprompt_evals,
  public.polyprompt_templates, public.polyprompt_execution_requests, public.polyprompt_run_usage,
  public.polyprompt_billing_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.polyprompt_profiles, public.polyprompt_runs, public.polyprompt_evals,
  public.polyprompt_templates, public.polyprompt_execution_requests, public.polyprompt_run_usage,
  public.polyprompt_billing_events TO service_role;
GRANT SELECT ON public.polyprompt_profiles, public.polyprompt_evals, public.polyprompt_run_usage TO authenticated;
GRANT UPDATE (full_name, avatar_url) ON public.polyprompt_profiles TO authenticated;
GRANT SELECT, DELETE ON public.polyprompt_runs, public.polyprompt_templates TO authenticated;
GRANT INSERT (id, title, prompt, user_id, models, variables, resolved_prompt, seed, max_output_tokens) ON public.polyprompt_runs TO authenticated;
GRANT UPDATE (title) ON public.polyprompt_runs TO authenticated;
GRANT INSERT (title, description, prompt, category, variables, created_by) ON public.polyprompt_templates TO authenticated;

-- Create only this product's policies. Existing policies for other products remain intact.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'polyprompt_profiles' AND policyname = 'polyprompt_profile_read') THEN
    CREATE POLICY polyprompt_profile_read ON public.polyprompt_profiles FOR SELECT TO authenticated USING (id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'polyprompt_profiles' AND policyname = 'polyprompt_profile_update') THEN
    CREATE POLICY polyprompt_profile_update ON public.polyprompt_profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'polyprompt_runs' AND policyname = 'polyprompt_run_read') THEN
    CREATE POLICY polyprompt_run_read ON public.polyprompt_runs FOR SELECT TO authenticated USING (user_id = auth.uid() AND (created_at >= now() - interval '90 days' OR EXISTS (SELECT 1 FROM public.polyprompt_profiles p WHERE p.id = auth.uid() AND p.tier <> 'free')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'polyprompt_runs' AND policyname = 'polyprompt_run_insert') THEN
    CREATE POLICY polyprompt_run_insert ON public.polyprompt_runs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'polyprompt_runs' AND policyname = 'polyprompt_run_update') THEN
    CREATE POLICY polyprompt_run_update ON public.polyprompt_runs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'polyprompt_runs' AND policyname = 'polyprompt_run_delete') THEN
    CREATE POLICY polyprompt_run_delete ON public.polyprompt_runs FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'polyprompt_evals' AND policyname = 'polyprompt_eval_read') THEN
    CREATE POLICY polyprompt_eval_read ON public.polyprompt_evals FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.polyprompt_runs r WHERE r.id = run_id AND r.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'polyprompt_templates' AND policyname = 'polyprompt_template_read') THEN
    CREATE POLICY polyprompt_template_read ON public.polyprompt_templates FOR SELECT TO authenticated USING (created_by = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'polyprompt_templates' AND policyname = 'polyprompt_template_insert') THEN
    CREATE POLICY polyprompt_template_insert ON public.polyprompt_templates FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'polyprompt_templates' AND policyname = 'polyprompt_template_delete') THEN
    CREATE POLICY polyprompt_template_delete ON public.polyprompt_templates FOR DELETE TO authenticated USING (created_by = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'polyprompt_run_usage' AND policyname = 'polyprompt_usage_read') THEN
    CREATE POLICY polyprompt_usage_read ON public.polyprompt_run_usage FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.polyprompt_handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.polyprompt_profiles(id, email, full_name, avatar_url)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.polyprompt_handle_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
REVOKE ALL ON FUNCTION public.polyprompt_handle_new_user(), public.polyprompt_handle_updated_at() FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'polyprompt_auth_user_created' AND tgrelid = 'auth.users'::regclass) THEN
    CREATE TRIGGER polyprompt_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.polyprompt_handle_new_user();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'polyprompt_profiles_updated' AND tgrelid = 'public.polyprompt_profiles'::regclass) THEN
    CREATE TRIGGER polyprompt_profiles_updated BEFORE UPDATE ON public.polyprompt_profiles FOR EACH ROW EXECUTE FUNCTION public.polyprompt_handle_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'polyprompt_runs_updated' AND tgrelid = 'public.polyprompt_runs'::regclass) THEN
    CREATE TRIGGER polyprompt_runs_updated BEFORE UPDATE ON public.polyprompt_runs FOR EACH ROW EXECUTE FUNCTION public.polyprompt_handle_updated_at();
  END IF;
END;
$$;
-- Backfill only PolyPrompt profiles for identities that already exist in shared Supabase Auth.
INSERT INTO public.polyprompt_profiles(id, email, full_name, avatar_url)
SELECT id, email, raw_user_meta_data->>'full_name', raw_user_meta_data->>'avatar_url' FROM auth.users
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.polyprompt_prune_expired_runs(p_user_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  DELETE FROM public.polyprompt_runs r USING public.polyprompt_profiles p WHERE r.user_id = p.id AND p.tier = 'free'
    AND r.created_at < now() - interval '90 days' AND (p_user_id IS NULL OR r.user_id = p_user_id);
  -- Keep a living run's original receipt so a retry after month rollover never debits it again.
  DELETE FROM public.polyprompt_run_usage u WHERE u.created_at < date_trunc('month', now())
    AND NOT EXISTS (SELECT 1 FROM public.polyprompt_runs r WHERE r.id = u.run_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.polyprompt_reserve_execution(p_user_id uuid, p_run_id uuid, p_request_id uuid,
  p_retry_models text[] DEFAULT NULL, p_byok boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r public.polyprompt_runs; p public.polyprompt_profiles; receipt public.polyprompt_execution_requests; used integer; already_charged boolean;
BEGIN
  SELECT * INTO p FROM public.polyprompt_profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'owner_not_found'; END IF;
  SELECT * INTO r FROM public.polyprompt_runs WHERE id = p_run_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR (p.tier = 'free' AND r.created_at < now() - interval '90 days') THEN RAISE EXCEPTION 'owner_not_found'; END IF;
  SELECT * INTO receipt FROM public.polyprompt_execution_requests WHERE run_id = p_run_id AND request_id = p_request_id;
  IF FOUND THEN
    IF receipt.complete THEN RETURN jsonb_build_object('cached', true); END IF;
    RAISE EXCEPTION 'execution_busy';
  END IF;
  IF r.status = 'running' OR r.active_request IS NOT NULL THEN RAISE EXCEPTION 'execution_busy'; END IF;
  IF r.executed_at IS NULL AND EXISTS (SELECT 1 FROM public.polyprompt_run_usage WHERE run_id = p_run_id) THEN
    RAISE EXCEPTION 'reused_run_id';
  END IF;
  IF r.executed_at IS NOT NULL AND p_retry_models IS NULL THEN RETURN jsonb_build_object('cached', true); END IF;
  IF p_retry_models IS NOT NULL THEN
    IF cardinality(p_retry_models) = 0 OR cardinality(p_retry_models) > 10 OR
      cardinality(p_retry_models) <> (SELECT count(DISTINCT value) FROM unnest(p_retry_models) value) OR EXISTS (
      SELECT 1 FROM unnest(p_retry_models) m WHERE NOT EXISTS (
        SELECT 1 FROM public.polyprompt_evals e WHERE e.run_id = p_run_id AND e.model = m AND e.error IS NOT NULL
      )
    ) THEN RAISE EXCEPTION 'invalid_retry'; END IF;
  END IF;
  IF cardinality(r.models) < 1 OR cardinality(r.models) > 10 THEN RAISE EXCEPTION 'model_limit'; END IF;
  IF NOT p_byok AND p.tier = 'free' AND cardinality(r.models) > 2 THEN RAISE EXCEPTION 'model_limit'; END IF;
  SELECT charged INTO already_charged FROM public.polyprompt_run_usage WHERE run_id = p_run_id;
  IF NOT p_byok AND NOT coalesce(already_charged, false) THEN
    SELECT count(*) INTO used FROM public.polyprompt_run_usage WHERE user_id = p_user_id AND charged = true
      AND created_at >= date_trunc('month', now());
    IF p.tier = 'free' AND used >= 50 THEN RAISE EXCEPTION 'quota_exceeded'; END IF;
    INSERT INTO public.polyprompt_run_usage(run_id, user_id, charged) VALUES (p_run_id, p_user_id, true)
      ON CONFLICT (run_id) DO UPDATE SET charged = true, created_at = now();
  END IF;
  INSERT INTO public.polyprompt_execution_requests(run_id, request_id) VALUES (p_run_id, p_request_id);
  UPDATE public.polyprompt_runs SET status = 'running', active_request = p_request_id, executed_at = coalesce(executed_at, now())
    WHERE id = p_run_id AND user_id = p_user_id;
  RETURN jsonb_build_object('cached', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.polyprompt_finish_execution(p_user_id uuid, p_run_id uuid, p_request_id uuid, p_results jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.polyprompt_runs; item jsonb; successful boolean;
BEGIN
  SELECT * INTO r FROM public.polyprompt_runs WHERE id = p_run_id AND user_id = p_user_id AND active_request = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution_not_owned'; END IF;
  IF jsonb_typeof(p_results) <> 'array' OR jsonb_array_length(p_results) < 1 OR jsonb_array_length(p_results) > 10 THEN RAISE EXCEPTION 'invalid_results'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_results) LOOP
    IF NOT (item->>'model' = ANY(r.models)) THEN RAISE EXCEPTION 'invalid_results'; END IF;
    INSERT INTO public.polyprompt_evals(run_id, model, actual_model, provider, output, tokens_in, tokens_out, latency_ms,
      cost_usd, cost_source, error, error_code, generation_id, finish_reason, seed_applied, created_at)
    VALUES (p_run_id, item->>'model', item->>'actual_model', item->>'provider', item->>'output',
      (item->>'tokens_in')::integer, (item->>'tokens_out')::integer, (item->>'latency_ms')::integer,
      (item->>'cost_usd')::numeric, item->>'cost_source', item->>'error', item->>'error_code',
      item->>'generation_id', item->>'finish_reason', (item->>'seed_applied')::boolean, (item->>'created_at')::timestamptz)
    ON CONFLICT (run_id, model) DO UPDATE SET actual_model = excluded.actual_model, provider = excluded.provider,
      output = excluded.output, tokens_in = excluded.tokens_in, tokens_out = excluded.tokens_out, latency_ms = excluded.latency_ms,
      cost_usd = excluded.cost_usd, cost_source = excluded.cost_source, error = excluded.error, error_code = excluded.error_code,
      generation_id = excluded.generation_id, finish_reason = excluded.finish_reason, seed_applied = excluded.seed_applied,
      created_at = excluded.created_at;
  END LOOP;
  SELECT EXISTS(SELECT 1 FROM public.polyprompt_evals WHERE run_id = p_run_id AND error IS NULL) INTO successful;
  UPDATE public.polyprompt_runs SET status = CASE WHEN successful THEN 'completed' ELSE 'error' END, active_request = NULL
    WHERE id = p_run_id AND user_id = p_user_id;
  UPDATE public.polyprompt_execution_requests SET complete = true WHERE run_id = p_run_id AND request_id = p_request_id;
  IF NOT successful THEN UPDATE public.polyprompt_run_usage SET charged = false WHERE run_id = p_run_id; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.polyprompt_set_run_share(p_user_id uuid, p_run_id uuid, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.polyprompt_runs; tier text;
BEGIN
  IF p_token IS NOT NULL AND p_token !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_share_token'; END IF;
  SELECT p.tier INTO tier FROM public.polyprompt_profiles p WHERE p.id = p_user_id;
  UPDATE public.polyprompt_runs SET is_public = p_token IS NOT NULL, share_id = p_token,
    share_expires_at = CASE WHEN p_token IS NULL OR tier <> 'free' THEN NULL ELSE now() + interval '30 days' END
  WHERE id = p_run_id AND user_id = p_user_id AND executed_at IS NOT NULL
    AND (tier <> 'free' OR created_at >= now() - interval '90 days') RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'owner_not_found'; END IF;
  RETURN jsonb_build_object('share_id', r.share_id, 'share_expires_at', r.share_expires_at);
END;
$$;

-- Share tokens are capabilities. Ordinary SELECT access never exposes shared polyprompt_runs or their owner IDs.
CREATE OR REPLACE FUNCTION public.polyprompt_read_run_share(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.polyprompt_runs; results jsonb;
BEGIN
  IF p_token !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT polyprompt_runs.* INTO r FROM public.polyprompt_runs JOIN public.polyprompt_profiles p ON p.id = polyprompt_runs.user_id
    WHERE polyprompt_runs.share_id = p_token AND polyprompt_runs.is_public = true
      AND (polyprompt_runs.share_expires_at IS NULL OR polyprompt_runs.share_expires_at > now())
      AND (p.tier <> 'free' OR polyprompt_runs.created_at >= now() - interval '90 days');
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at), '[]'::jsonb) INTO results FROM public.polyprompt_evals e WHERE e.run_id = r.id;
  RETURN jsonb_build_object('run', to_jsonb(r) - 'user_id' - 'active_request', 'evals', results);
END;
$$;

REVOKE ALL ON FUNCTION public.polyprompt_reserve_execution(uuid, uuid, uuid, text[], boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.polyprompt_finish_execution(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.polyprompt_set_run_share(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.polyprompt_prune_expired_runs(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.polyprompt_reserve_execution(uuid, uuid, uuid, text[], boolean), public.polyprompt_finish_execution(uuid, uuid, uuid, jsonb),
  public.polyprompt_set_run_share(uuid, uuid, text), public.polyprompt_prune_expired_runs(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.polyprompt_read_run_share(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.polyprompt_read_run_share(text) TO anon, authenticated;

-- Serialize Stripe reconciliation across the remote read and local write, including same-second events.
CREATE OR REPLACE FUNCTION public.polyprompt_begin_billing_sync(p_user_id uuid, p_customer_id text, p_event_id text, p_sync_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p public.polyprompt_profiles;
BEGIN
  SELECT * INTO p FROM public.polyprompt_profiles WHERE id = p_user_id AND stripe_customer_id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'billing_owner_mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM public.polyprompt_billing_events WHERE event_id = p_event_id) THEN RETURN jsonb_build_object('cached', true); END IF;
  IF p.billing_sync_until > now() THEN RAISE EXCEPTION 'billing_busy'; END IF;
  UPDATE public.polyprompt_profiles SET billing_sync_token = p_sync_token, billing_sync_until = now() + interval '90 seconds' WHERE id = p_user_id;
  RETURN jsonb_build_object('cached', false);
END;
$$;
CREATE OR REPLACE FUNCTION public.polyprompt_release_billing_sync(p_user_id uuid, p_sync_token uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.polyprompt_profiles SET billing_sync_token = NULL, billing_sync_until = NULL WHERE id = p_user_id AND billing_sync_token = p_sync_token;
$$;
CREATE OR REPLACE FUNCTION public.polyprompt_apply_billing_event(p_event_id text, p_user_id uuid, p_customer_id text,
  p_subscription_id text, p_tier text, p_event_time bigint, p_sync_token uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_tier NOT IN ('free', 'pro') THEN RAISE EXCEPTION 'invalid_tier'; END IF;
  PERFORM 1 FROM public.polyprompt_profiles WHERE id = p_user_id AND stripe_customer_id = p_customer_id
    AND billing_sync_token = p_sync_token AND billing_sync_until > now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'billing_lease_invalid'; END IF;
  IF EXISTS (SELECT 1 FROM public.polyprompt_billing_events WHERE event_id = p_event_id) THEN RETURN; END IF;
  UPDATE public.polyprompt_profiles SET tier = p_tier, stripe_subscription_id = p_subscription_id,
    billing_event_time = greatest(billing_event_time, p_event_time), billing_sync_token = NULL, billing_sync_until = NULL WHERE id = p_user_id;
  INSERT INTO public.polyprompt_billing_events(event_id) VALUES(p_event_id);
END;
$$;
REVOKE ALL ON FUNCTION public.polyprompt_begin_billing_sync(uuid, text, text, uuid), public.polyprompt_release_billing_sync(uuid, uuid),
  public.polyprompt_apply_billing_event(text, uuid, text, text, text, bigint, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.polyprompt_begin_billing_sync(uuid, text, text, uuid), public.polyprompt_release_billing_sync(uuid, uuid),
  public.polyprompt_apply_billing_event(text, uuid, text, text, text, bigint, uuid) TO service_role;

COMMIT;
