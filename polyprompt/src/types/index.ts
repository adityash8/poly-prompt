// Core entities
export interface Run {
  id: string;
  title: string;
  prompt: string;
  status: 'draft' | 'ready' | 'running' | 'completed' | 'error';
  created_at: string;
  updated_at: string;
  user_id: string;
  is_public: boolean;
  variables?: Record<string, string>;
  share_id?: string;
  models: string[];
}

export interface Eval {
  id: string;
  run_id: string;
  model: string;
  provider: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  output: string;
  score?: number;
  error?: string;
  created_at: string;
}

// Model configurations
export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  maxTokens: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  available: boolean;
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    maxTokens: 128000,
    costPer1kInput: 0.0025,
    costPer1kOutput: 0.01,
    available: true,
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    maxTokens: 200000,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    available: true,
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    maxTokens: 1000000,
    costPer1kInput: 0.0035,
    costPer1kOutput: 0.0105,
    available: true,
  },
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large',
    provider: 'mistral',
    maxTokens: 32768,
    costPer1kInput: 0.007,
    costPer1kOutput: 0.024,
    available: true,
  },
];
