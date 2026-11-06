import { Hono } from 'hono';
import {
  stripeClient, tierFromSubscription, activeStatus, TIERS,
} from '../lib/stripe.js';
import {
  upsertSubscription, getSubscriptionByStripeCustomerId,
  isEventProcessed, markEventProcessed,
} from '../lib/supabase.js';

const webhook = new Hono();

async function applySubscriptionUpdate(c, subscription) {
  const env = c.env;
  const stripe = stripeClient(env);

  // Find the SafeCart user_id. Prefer subscription metadata; fall back to
  // customer metadata; finally, fall back to a customer-id lookup in DB.
  let userId =
    subscription.metadata?.user_id ||
    (typeof subscription.customer === 'string'
      ? (await stripe.customers.retrieve(subscription.customer)).metadata?.user_id
      : subscription.customer?.metadata?.user_id);

  if (!userId) {
    const stripeCustomerId =
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    const existing = await getSubscriptionByStripeCustomerId(env, stripeCustomerId);
    userId = existing?.user_id;
  }
  if (!userId) {
    console.warn('[webhook] could not resolve user_id for subscription', subscription.id);
    return;
  }

  const tier = tierFromSubscription(env, subscription);
  const effectiveTier = activeStatus(subscription.status) ? tier : TIERS.FREE;
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;

  await upsertSubscription(env, {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    tier: effectiveTier,
    status: subscription.status,
    current_period_end: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
  });
}

webhook.post('/', async (c) => {
  const sig = c.req.header('stripe-signature');
  if (!sig) return c.text('missing signature', 400);

  const rawBody = await c.req.text();
  const stripe = stripeClient(c.env);

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, c.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return c.text(`Webhook signature verification failed: ${err.message}`, 400);
  }

  if (await isEventProcessed(c.env, event.id)) {
    return c.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          // Stamp user_id on subscription + customer for future webhook lookups.
          if (!subscription.metadata?.user_id && session.client_reference_id) {
            await stripe.subscriptions.update(subscription.id, {
              metadata: { ...(subscription.metadata || {}), user_id: session.client_reference_id },
            });
            subscription.metadata = { ...(subscription.metadata || {}), user_id: session.client_reference_id };
          }
          if (session.customer && session.client_reference_id) {
            try {
              await stripe.customers.update(session.customer, {
                metadata: { user_id: session.client_reference_id },
              });
            } catch (err) { console.warn('[webhook] customer metadata update failed', err.message); }
          }
          await applySubscriptionUpdate(c, subscription);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await applySubscriptionUpdate(c, event.data.object);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          await applySubscriptionUpdate(c, subscription);
        }
        break;
      }

      default:
        break;
    }

    await markEventProcessed(c.env, event.id);
    return c.json({ received: true });
  } catch (err) {
    console.error('[webhook] handler failed', err);
    return c.json({ error: 'handler_failed', detail: err.message }, 500);
  }
});

export default webhook;
