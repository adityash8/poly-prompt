import { api } from '@/lib/http';
import { createServiceClient } from '@/lib/supabase-server';
import { stripeClient, currentSubscription } from '@/lib/billing';
import { AppError, validId } from '@/lib/validation';
import type Stripe from 'stripe';
export const maxDuration = 60;
export async function POST(request: Request) {
  return api(async () => {
    const stripe = stripeClient();
    const signature = request.headers.get('stripe-signature');
    if (!signature) throw new AppError(400, 'Missing webhook signature.');
    const text = await request.text();
    if (text.length > 262144) throw new AppError(413, 'Webhook is too large.');
    let event: Stripe.Event;
    try { event = stripe.webhooks.constructEvent(text, signature, process.env.STRIPE_WEBHOOK_SECRET!); }
    catch { throw new AppError(400, 'Invalid webhook signature.'); }
    if (!['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) return { received: true };
    const supplied = event.data.object as Stripe.Subscription;
    const userId = validId(supplied.metadata.user_id ?? '');
    const customerId = typeof supplied.customer === 'string' ? supplied.customer : supplied.customer.id;
    const admin = createServiceClient();
    if (!admin) throw new AppError(503, 'Billing storage is not configured.');
    const syncToken = crypto.randomUUID();
    const { data, error } = await admin.rpc('polyprompt_begin_billing_sync', { p_user_id: userId, p_customer_id: customerId,
      p_event_id: event.id, p_sync_token: syncToken });
    if (error) throw new AppError(503, 'Billing reconciliation is busy or unavailable. Stripe should retry this event.');
    if (data?.cached) return { received: true };
    try {
      const subscriptionId = await currentSubscription(stripe, customerId, userId, process.env.STRIPE_PRO_PRICE_ID!);
      const { error: saveError } = await admin.rpc('polyprompt_apply_billing_event', { p_event_id: event.id, p_user_id: userId, p_customer_id: customerId,
        p_subscription_id: subscriptionId, p_tier: subscriptionId ? 'pro' : 'free', p_event_time: event.created, p_sync_token: syncToken });
      if (saveError) throw new AppError(503, 'Billing update could not be saved. Stripe should retry this event.');
      return { received: true };
    } finally { await admin.rpc('polyprompt_release_billing_sync', { p_user_id: userId, p_sync_token: syncToken }); }
  });
}
