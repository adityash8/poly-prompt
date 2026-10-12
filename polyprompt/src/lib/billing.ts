import 'server-only';
import Stripe from 'stripe';
import { AppError } from '@/lib/validation';

export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRO_PRICE_ID && process.env.STRIPE_WEBHOOK_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
export function stripeClient() {
  if (!billingConfigured()) throw new AppError(503, 'Billing needs STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID, STRIPE_WEBHOOK_SECRET, and cloud execution setup. No checkout was created.');
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { maxNetworkRetries: 0, timeout: 20000 });
}
export async function currentSubscription(stripe: Stripe, customerId: string, userId: string, priceId: string) {
  // Reconcile all eligible subscriptions. Expiration of an old incomplete checkout must not cancel a paid plan.
  for await (const subscription of stripe.subscriptions.list({ customer: customerId, status: 'all', price: priceId, limit: 100 })) {
    if (subscription.metadata.user_id === userId && subscriptionTier(subscription, priceId) === 'pro') return subscription.id;
  }
  return null;
}
export function subscriptionTier(subscription: Pick<Stripe.Subscription, 'status' | 'items'>, priceId: string): 'free' | 'pro' {
  return ['active', 'trialing'].includes(subscription.status) && subscription.items.data.some(item => item.price.id === priceId) ? 'pro' : 'free';
}
