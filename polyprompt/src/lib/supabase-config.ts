export function supabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || /your_|placeholder|example/i.test(url + key)) return false;
  try { return ['https:', 'http:'].includes(new URL(url).protocol); } catch { return false; }
}
