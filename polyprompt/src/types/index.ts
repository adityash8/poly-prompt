export type Provider = 'openrouter' | 'openai' | 'anthropic' | 'google' | 'mistral';
export type Credentials = Partial<Record<Provider, string>>;

export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  context_length: number;
  input_price: number | null;
  output_price: number | null;
  supports_seed: boolean;
}

export interface RunInput {
  title: string;
  prompt: string;
  variables: Record<string, string>;
  models: string[];
  seed: number | null;
  max_output_tokens: number;
}

export interface Run extends RunInput {
  id: string;
  resolved_prompt: string;
  status: 'draft' | 'ready' | 'running' | 'completed' | 'error';
  created_at: string;
  updated_at: string;
  user_id?: string;
  is_public: boolean;
  share_id?: string | null;
  share_expires_at?: string | null;
  executed_at?: string | null;
}

export interface Eval {
  id?: string;
  run_id?: string;
  model: string;
  actual_model: string | null;
  provider: Provider;
  latency_ms: number;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  cost_source: 'receipt' | 'estimate' | 'unavailable';
  output: string;
  error: string | null;
  error_code: string | null;
  generation_id: string | null;
  finish_reason: string | null;
  seed_applied: boolean;
  created_at: string;
}

export interface Comparison {
  run: Run;
  results: Eval[];
  saved: boolean;
  warning?: string;
}

export interface Template {
  id: string;
  title: string;
  description: string;
  prompt: string;
  category: string;
  variables: Record<string, string>;
}
