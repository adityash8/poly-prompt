export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...options, cache: 'no-store' }); }
  catch { throw new Error('The server could not be reached. If a run started, check history before retrying; the provider may have charged.'); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'The request failed. Please retry.');
  if (data === null) throw new Error('The server returned an invalid response.');
  return data as T;
}
