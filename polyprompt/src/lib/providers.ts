import type { Credentials, Eval, ModelConfig, Provider, RunInput } from '@/types';
import { resolvePrompt } from '@/lib/validation';

class ProviderFailure extends Error {
  constructor(public code: string, public status?: number) { super(code); }
}

const messages: Record<string, string> = {
  credentials: 'Add a key for OpenRouter or this model’s native provider.',
  auth: 'The provider rejected the key. Check its permissions and try again.',
  credits: 'The provider reports insufficient credit. Use another key or check your provider account.',
  rate_limit: 'The provider rate limited this request. Wait before retrying.',
  retired: 'This model is unavailable at the provider. Select a current model.',
  timeout: 'No response within 15 seconds. The provider may still charge for the request; retry sends a new request.',
  network: 'The provider could not be reached. Retry sends a new request and may incur another provider charge.',
  invalid_response: 'The provider returned no valid text response. Retry sends a new request.',
  rejected: 'The provider rejected this prompt or its settings. Adjust the prompt or choose another model.',
  unavailable: 'The provider is unavailable. Retry sends a new request.',
};

function failure(status: number): ProviderFailure {
  const code = status === 401 || status === 403 ? 'auth' : status === 402 ? 'credits' : status === 429 ? 'rate_limit' :
    status === 404 ? 'retired' : status >= 500 ? 'unavailable' : 'rejected';
  return new ProviderFailure(code, status);
}

async function jsonRequest(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal, fetcher: typeof fetch) {
  const response = await fetcher(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal, cache: 'no-store' });
  // Upstream error bodies may echo keys or private prompts. Never return or log them.
  if (!response.ok) throw failure(response.status);
  try { return await response.json(); } catch { throw new ProviderFailure('invalid_response'); }
}

export function nativeProvider(model: string): Exclude<Provider, 'openrouter'> | null {
  const provider = model.split('/')[0];
  return provider === 'mistralai' ? 'mistral' : ['openai', 'anthropic', 'google'].includes(provider) ? provider as Exclude<Provider, 'openrouter'> : null;
}

export function canExecute(model: string, credentials: Credentials): boolean {
  const provider = nativeProvider(model);
  return Boolean(credentials.openrouter || (provider && credentials[provider]));
}

export async function executeModel(model: ModelConfig, input: RunInput, credentials: Credentials,
  fetcher: typeof fetch = fetch, timeoutMs = 15000): Promise<Eval> {
  const start = Date.now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let provider: Provider = credentials.openrouter ? 'openrouter' : nativeProvider(model.id) ?? 'openrouter';
  const base: Eval = { model: model.id, actual_model: null, provider, output: '', latency_ms: 0,
    tokens_in: null, tokens_out: null, cost_usd: null, cost_source: 'unavailable', error: null, error_code: null,
    generation_id: null, finish_reason: null, seed_applied: false, created_at: new Date().toISOString() };
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new ProviderFailure('timeout')); }, timeoutMs);
  });
  try {
    const work = async () => {
      const prompt = resolvePrompt(input.prompt, input.variables);
      let data;
      let nativeSeed = false;
      const callNative = async () => {
        const native = nativeProvider(model.id);
        if (!native || !credentials[native]) throw new ProviderFailure('credentials');
        provider = native;
        const key = credentials[native]!;
        const id = model.id.split('/')[1].replace(/:.*$/, '');
        if (native === 'anthropic') {
          const nativeId = id.replace(/(claude-(?:sonnet|opus|haiku)-\d)\.(\d)/, '$1-$2')
            .replace(/^(claude-(?:sonnet|opus)-4)$/, '$1-0');
          return jsonRequest('https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
            { model: nativeId, max_tokens: input.max_output_tokens, messages: [{ role: 'user', content: prompt }] }, controller.signal, fetcher);
        }
        if (native === 'google') {
          nativeSeed = input.seed !== null && model.supports_seed;
          return jsonRequest(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(id)}:generateContent`,
            { 'x-goog-api-key': key }, { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: {
              maxOutputTokens: input.max_output_tokens, ...(nativeSeed ? { seed: input.seed } : {}) } }, controller.signal, fetcher);
        }
        nativeSeed = input.seed !== null && model.supports_seed;
        return jsonRequest(native === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://api.mistral.ai/v1/chat/completions',
          { Authorization: `Bearer ${key}` }, { model: id, messages: [{ role: 'user', content: prompt }],
            ...(native === 'openai' ? { max_completion_tokens: input.max_output_tokens } : { max_tokens: input.max_output_tokens }),
            ...(nativeSeed ? { [native === 'mistral' ? 'random_seed' : 'seed']: input.seed } : {}) }, controller.signal, fetcher);
      };
      if (credentials.openrouter) {
        try {
          data = await jsonRequest('https://openrouter.ai/api/v1/chat/completions', { Authorization: `Bearer ${credentials.openrouter}` }, {
            model: model.id, messages: [{ role: 'user', content: prompt }], max_tokens: input.max_output_tokens,
            provider: { data_collection: 'deny' }, ...(input.seed !== null && model.supports_seed ? { seed: input.seed } : {}),
          }, controller.signal, fetcher);
        } catch (error) {
          // A timeout/network/5xx failure may have been billed. Only explicit rejections permit automatic fallback.
          if (error instanceof ProviderFailure && [401, 402, 404, 429].includes(error.status ?? 0) &&
              nativeProvider(model.id) && credentials[nativeProvider(model.id)!]) data = await callNative();
          else throw error;
        }
      } else data = await callNative();

      const result = { ...base, provider };
      if (provider === 'anthropic') {
        result.output = Array.isArray(data.content) ? data.content.filter((block: { type: string }) => block.type === 'text').map((block: { text: string }) => block.text).join('\n') : '';
        result.tokens_in = tokenCount(data.usage?.input_tokens);
        result.tokens_out = tokenCount(data.usage?.output_tokens);
        result.actual_model = data.model ?? null;
        result.finish_reason = data.stop_reason ?? null;
      } else if (provider === 'google') {
        const candidate = data.candidates?.[0];
        result.output = candidate?.content?.parts?.filter((part: { thought?: boolean }) => !part.thought).map((part: { text?: string }) => part.text ?? '').join('') ?? '';
        result.tokens_in = tokenCount(data.usageMetadata?.promptTokenCount);
        const tokens = tokenCount(data.usageMetadata?.candidatesTokenCount);
        result.tokens_out = tokens === null ? null : tokens + (tokenCount(data.usageMetadata?.thoughtsTokenCount) ?? 0);
        result.actual_model = data.modelVersion ?? null;
        result.finish_reason = candidate?.finishReason ?? null;
      } else {
        if (data.error || data.choices?.[0]?.error) throw new ProviderFailure('rejected');
        result.output = typeof data.choices?.[0]?.message?.content === 'string' ? data.choices[0].message.content : '';
        result.tokens_in = tokenCount(data.usage?.prompt_tokens);
        result.tokens_out = tokenCount(data.usage?.completion_tokens);
        result.actual_model = typeof data.model === 'string' ? data.model : null;
        result.finish_reason = data.choices?.[0]?.finish_reason ?? null;
        if (provider === 'openrouter') {
          const cost = data.usage?.cost;
          if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) {
            result.cost_usd = cost; result.cost_source = 'receipt';
          } else if (result.tokens_in !== null && result.tokens_out !== null && model.input_price !== null && model.output_price !== null) {
            result.cost_usd = result.tokens_in * model.input_price + result.tokens_out * model.output_price;
            result.cost_source = 'estimate';
          }
        }
      }
      result.generation_id = typeof data.id === 'string' ? data.id : null;
      result.seed_applied = provider === 'openrouter' ? input.seed !== null && model.supports_seed : nativeSeed;
      if (!result.output) { result.error = messages.invalid_response; result.error_code = 'invalid_response'; }
      return result;
    };
    const result = await Promise.race([work(), timeout]);
    return { ...result, latency_ms: Date.now() - start };
  } catch (error) {
    const code = error instanceof ProviderFailure ? error.code : controller.signal.aborted ? 'timeout' : 'network';
    return { ...base, provider, latency_ms: Date.now() - start, error: messages[code] ?? messages.unavailable, error_code: code };
  } finally { clearTimeout(timer); controller.abort(); }
}

function tokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

export async function compare(input: RunInput, models: ModelConfig[], credentials: Credentials, fetcher: typeof fetch = fetch, timeoutMs = 15000): Promise<Eval[]> {
  const settled = await Promise.allSettled(models.map(model => executeModel(model, input, credentials, fetcher, timeoutMs)));
  return settled.map(result => { if (result.status === 'rejected') throw result.reason; return result.value; });
}
