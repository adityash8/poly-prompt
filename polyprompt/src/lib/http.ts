import { NextResponse } from 'next/server';
import { AppError, record } from '@/lib/validation';

export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  // Next may normalize request.url to its internal hostname. Host retains the browser-facing authority.
  const host = request.headers.get('host') ?? url.host;
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() ?? url.protocol.slice(0, -1);
  if (!['http', 'https'].includes(protocol) || !/^[a-zA-Z0-9.[\]:-]+$/.test(host)) throw new AppError(400, 'Invalid request origin.');
  return `${protocol}://${host}`;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if ((origin && origin !== requestOrigin(request)) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new AppError(403, 'This action must be requested from Poly Prompt.');
  }
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  assertSameOrigin(request);
  if (!request.headers.get('content-type')?.includes('application/json')) throw new AppError(415, 'Send application/json.');
  if (Number(request.headers.get('content-length') ?? 0) > 65536) throw new AppError(413, 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, 'A JSON body is required.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) { await reader.cancel(); throw new AppError(413, 'Request is too large.'); }
    chunks.push(value);
  }
  try { return record(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
  catch (error) { if (error instanceof AppError) throw error; throw new AppError(400, 'Invalid JSON.'); }
}

export async function api(action: () => Promise<unknown>) {
  try {
    const result = await action();
    if (result instanceof Response) return result;
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AppError ? error.message : 'The request could not be completed. Please retry.' }, {
      status: error instanceof AppError ? error.status : 500, headers: { 'Cache-Control': 'no-store' },
    });
  }
}
