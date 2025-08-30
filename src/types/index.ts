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
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    maxTokens: 128000,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
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
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    maxTokens: 200000,
    costPer1kInput: 0.00025,
    costPer1kOutput: 0.00125,
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
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    provider: 'google',
    maxTokens: 1000000,
    costPer1kInput: 0.000075,
    costPer1kOutput: 0.0003,
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
  {
    id: 'mistral-medium-latest',
    name: 'Mistral Medium',
    provider: 'mistral',
    maxTokens: 32768,
    costPer1kInput: 0.0027,
    costPer1kOutput: 0.0081,
    available: true,
  },
];

// API types
export interface CreateRunRequest {
  title: string;
  prompt: string;
  variables?: Record<string, string>;
  is_public?: boolean;
}

export interface UpdateRunRequest {
  title?: string;
  prompt?: string;
  variables?: Record<string, string>;
  is_public?: boolean;
}

export interface ExecuteRunRequest {
  models: string[];
  variables?: Record<string, string>;
}

export interface ExecuteRunResponse {
  evals: Eval[];
  total_cost: number;
  total_latency: number;
}

// User and auth types
export interface User {
  id: string;
  email: string;
  created_at: string;
  plan: 'free' | 'pro' | 'team';
  api_keys?: Record<string, string>;
}

// UI state types
export interface UIState {
  selectedRunId?: string;
  leftRailCollapsed: boolean;
  commandPaletteOpen: boolean;
  theme: 'light' | 'dark' | 'system';
}

// Command palette types
export interface CommandAction {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  action: () => void;
  keywords?: string[];
}

// Toast types
export interface Toast {
  id: string;
  title: string;
  description?: string;
  type: 'default' | 'success' | 'error' | 'warning';
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Search and filter types
export interface RunFilters {
  status?: Run['status'][];
  models?: string[];
  dateRange?: {
    from: string;
    to: string;
  };
  search?: string;
}

// Pricing types
export interface PricingPlan {
  id: 'free' | 'pro' | 'team';
  name: string;
  price: number;
  features: string[];
  limits: {
    runsPerMonth: number;
    maxModels: number;
    shareLinks: boolean;
    templates: boolean;
    apiKeys: boolean;
  };
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    features: ['50 runs/month', '2 models at once', 'Basic templates'],
    limits: {
      runsPerMonth: 50,
      maxModels: 2,
      shareLinks: false,
      templates: false,
      apiKeys: false,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 19,
    features: ['Unlimited runs', 'All models', 'Share links', 'Templates', 'API keys'],
    limits: {
      runsPerMonth: -1,
      maxModels: -1,
      shareLinks: true,
      templates: true,
      apiKeys: true,
    },
  },
  {
    id: 'team',
    name: 'Team',
    price: 99,
    features: ['Everything in Pro', 'Team collaboration', 'SSO', 'Priority support'],
    limits: {
      runsPerMonth: -1,
      maxModels: -1,
      shareLinks: true,
      templates: true,
      apiKeys: true,
    },
  },
];
