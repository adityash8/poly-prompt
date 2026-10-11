import { api } from '@/lib/http';
import { createServerClient } from '@/lib/supabase-server';
import { AppError } from '@/lib/validation';
export async function GET(_request: Request, { params }: { params: Promise<{ shareId: string }> }) {
  return api(async () => {
    const { shareId } = await params;
    if (!/^[a-f0-9]{64}$/.test(shareId)) throw new AppError(404, 'This share link is invalid or expired.');
    const supabase = await createServerClient();
    if (!supabase) throw new AppError(503, 'Shared results need cloud history setup. Ask the owner for a JSON or CSV export.');
    const { data, error } = await supabase.rpc('polyprompt_read_run_share', { p_token: shareId });
    if (error) throw new AppError(503, 'Shared results could not be loaded. Please retry.');
    if (!data) throw new AppError(404, 'This link has expired, was revoked, or no longer exists.');
    return data;
  });
}
