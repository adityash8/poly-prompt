import { api, readBody, requestOrigin } from '@/lib/http';
import { requireUser, createServiceClient } from '@/lib/supabase-server';
import { stripeClient } from '@/lib/billing';
import { AppError, validId } from '@/lib/validation';
export async function POST(request: Request) {
  return api(async () => {
    const { supabase, user } = await requireUser();
    const body = await readBody(request);
    const attempt = validId(String(body.request_id ?? ''));
    const stripe = stripeClient();
    const admin = createServiceClient();
    if (!admin) throw new AppError(503, 'Billing needs cloud execution setup.');
    const { data: profile, error } = await supabase.from('polyprompt_profiles').select('stripe_customer_id,tier').eq('id', user.id).single();
    if (error || !profile) throw new AppError(503, 'Billing profile is not ready.');
    if (profile.tier !== 'free') throw new AppError(409, 'Use the billing portal to manage your existing subscription.');
    let customerId = profile.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({ ...(user.email ? { email: user.email } : {}), metadata: { user_id: user.id } }, { idempotencyKey: `poly-customer-${user.id}` });
      customerId = customer.id;
      const { error: saveError } = await admin.from('polyprompt_profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
      if (saveError) throw new AppError(503, 'Customer could not be saved. No checkout was created.');
    }
    const origin = requestOrigin(request);
    const session = await stripe.checkout.sessions.create({ mode: 'subscription', customer: customerId,
      client_reference_id: user.id, line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID!, quantity: 1 }],
      subscription_data: { metadata: { user_id: user.id } }, success_url: `${origin}/account?billing=updated`, cancel_url: `${origin}/account?billing=cancelled`,
    }, { idempotencyKey: `poly-checkout-${user.id}-${attempt}` });
    if (!session.url) throw new AppError(503, 'Checkout could not be opened.');
    return { url: session.url };
  });
}
