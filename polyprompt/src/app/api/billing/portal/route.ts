import { api, assertSameOrigin, requestOrigin } from '@/lib/http';
import { requireUser } from '@/lib/supabase-server';
import { stripeClient } from '@/lib/billing';
import { AppError } from '@/lib/validation';
export async function POST(request: Request) {
  return api(async () => {
    assertSameOrigin(request);
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase.from('polyprompt_profiles').select('stripe_customer_id').eq('id', user.id).single();
    if (error || !data?.stripe_customer_id) throw new AppError(400, 'No billing customer exists for this account.');
    const session = await stripeClient().billingPortal.sessions.create({ customer: data.stripe_customer_id, return_url: `${requestOrigin(request)}/account` });
    return { url: session.url };
  });
}
