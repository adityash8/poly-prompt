import type { ModelConfig } from '@/types';
import { AppError } from '@/lib/validation';

let cached: { models: ModelConfig[]; expires: number } | undefined;

export async function loadCatalog(fetcher: typeof fetch = fetch): Promise<ModelConfig[]> {
  if (fetcher === fetch && cached && cached.expires > Date.now()) return cached.models;
  try {
    const response = await fetcher('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(5000), cache: 'no-store' });
    if (!response.ok) throw new Error();
    const payload = await response.json();
    if (!Array.isArray(payload.data)) throw new Error();
    const models: ModelConfig[] = payload.data.filter((model: { id?: string; architecture?: { input_modalities?: string[]; output_modalities?: string[] } }) =>
      model.id && !model.id.includes(':batch') && model.architecture?.input_modalities?.includes('text') &&
      model.architecture.output_modalities?.length === 1 && model.architecture.output_modalities.includes('text'))
      .map((model: { id: string; name: string; context_length: number; pricing: { prompt?: string; completion?: string }; supported_parameters?: string[] }) => ({
        id: model.id, name: model.name, provider: model.id.split('/')[0], context_length: model.context_length,
        input_price: price(model.pricing?.prompt), output_price: price(model.pricing?.completion),
        supports_seed: model.supported_parameters?.includes('seed') ?? false,
      })).sort((a: ModelConfig, b: ModelConfig) => a.name.localeCompare(b.name));
    if (!models.length) throw new Error();
    if (fetcher === fetch) cached = { models, expires: Date.now() + 300000 };
    return models;
  } catch {
    throw new AppError(503, 'The live model catalog is unavailable. Please retry shortly; no provider request has been sent.');
  }
}

function price(value?: string): number | null {
  if (value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
