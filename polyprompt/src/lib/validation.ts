import type { Credentials, RunInput } from '@/types';

export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError(400, 'Expected a JSON object.');
  return value as Record<string, unknown>;
}

export function variableNames(prompt: string): string[] {
  return [...new Set([...prompt.matchAll(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g)].map(match => match[1]))];
}

export function resolvePrompt(prompt: string, variables: Record<string, string>): string {
  const missing = variableNames(prompt).filter(name => !Object.hasOwn(variables, name) || !variables[name].trim());
  if (missing.length) throw new AppError(400, `Fill in variables: ${missing.join(', ')}.`);
  const resolved = prompt.replace(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g, (_, name: string) => variables[name]);
  if (resolved.length > 4000) throw new AppError(400, 'The prompt including variable values must be at most 4,000 characters.');
  return resolved;
}

export function validateInput(value: unknown): RunInput {
  const body = record(value);
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 4000) {
    throw new AppError(400, 'Enter a prompt of 1 to 4,000 characters.');
  }
  if (!Array.isArray(body.models) || !body.models.length || body.models.length > 10 ||
      body.models.some(model => typeof model !== 'string' || !/^[\w.-]+\/[\w.:-]+$/.test(model)) ||
      new Set(body.models).size !== body.models.length) throw new AppError(400, 'Select 1 to 10 distinct catalog models.');
  const variables = record(body.variables ?? {});
  if (Object.keys(variables).length > 50 || Object.entries(variables).some(([key, val]) =>
    !/^[a-zA-Z_][\w]*$/.test(key) || key.length > 80 || typeof val !== 'string' || val.length > 4000)) {
    throw new AppError(400, 'Variables must have simple names and text values.');
  }
  const seed = body.seed ?? null;
  if (seed !== null && (!Number.isInteger(seed) || Number(seed) < 0 || Number(seed) > 2147483647)) {
    throw new AppError(400, 'Seed must be an integer between 0 and 2,147,483,647.');
  }
  const maxTokens = body.max_output_tokens ?? Math.min(1000, Math.floor(10000 / body.models.length));
  if (!Number.isInteger(maxTokens) || Number(maxTokens) < 1 || Number(maxTokens) * body.models.length > 10000) {
    throw new AppError(400, 'The total output budget across selected models must be at most 10,000 tokens.');
  }
  if (body.title !== undefined && (typeof body.title !== 'string' || body.title.length > 120)) throw new AppError(400, 'Title must be at most 120 characters.');
  const input: RunInput = { prompt: body.prompt, title: (body.title as string)?.trim() || body.prompt.slice(0, 60),
    models: body.models as string[], variables: variables as Record<string, string>, seed: seed as number | null,
    max_output_tokens: maxTokens as number };
  resolvePrompt(input.prompt, input.variables);
  return input;
}

export function credentialsFrom(value: unknown): Credentials {
  const supplied = record(value ?? {});
  const result: Credentials = {};
  for (const provider of ['openrouter', 'openai', 'anthropic', 'google', 'mistral'] as const) {
    const key = supplied[provider];
    if (key === undefined || key === '') continue;
    if (typeof key !== 'string' || key.length > 1024 || /[\s\x00-\x1f]/.test(key)) throw new AppError(400, 'Provider keys must contain no whitespace and be at most 1,024 characters.');
    result[provider] = key;
  }
  return result;
}

export function validId(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new AppError(400, 'Invalid run identifier.');
  return id;
}
