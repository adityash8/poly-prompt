import { api } from '@/lib/http';
import { requireUser } from '@/lib/supabase-server';
import { profileFor } from '@/lib/repository';
import { billingConfigured } from '@/lib/billing';
import { AppError } from '@/lib/validation';
export async function GET() {
  return api(async () => {
    const { supabase, user } = await requireUser();
    const profile = await profileFor(supabase, user.id);
    const month = new Date(); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
    const { count, error } = await supabase.from('polyprompt_run_usage').select('run_id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('charged', true).gte('created_at', month.toISOString());
    if (error) throw new AppError(503, 'Usage data needs the supplied Supabase migration.');
    return { tier: profile.tier, used: count ?? 0, limit: profile.tier === 'free' ? 50 : null, billingAvailable: billingConfigured() };
  });
}
