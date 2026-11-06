import express from 'express';
import { stripe } from '../stripe-client.js';
import { config, tierForPriceId, TIERS } from '../config.js';
import {
  upsertSubscription, updateByCustomer,
  isEventProcessed, markEventProcessed,
  getSubscriptionByCustomerId, getSubscriptionBySubscriptionId,
} from '../db.js';

const router = express.Router();

function extractTier(subscription) {
  const item = subscription?.items?.data?.[0];
  const priceId = item?.price?.id;
  return tierForPriceId(priceId) || TIERS.FREE;
}

async function applySubscriptionUpdate(subscription) {
  const clientRef =
    subscription.metadata?.client_ref ||
    (await stripe.customers.retrieve(subscription.customer))?.metadata?.client_ref;

  const tier = extractTier(subscription);
  const status = subscription.status;
  const activeStatuses = new Set(['active', 'trialing']);
  const effectiveTier = activeStatuses.has(status) ? tier : TIERS.FREE;

  const payload = {
    stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
    stripe_subscription_id: subscription.id,
    tier: effectiveTier,
    status,
    current_period_end: subscription.current_period_end ? subscription.current_period_end * 1000 : null,
    cancel_at_period_end: subscription.cancel_at_period_end ? 1 : 0,
  };

  if (clientRef) {
    upsertSubscription({ client_ref: clientRef, ...payload });
  } else if (payload.stripe_customer_id) {
    const changes = updateByCustomer({ ...payload });
    if (!changes) {
      console.warn('[webhook] subscription event without client_ref and no existing customer row', subscription.id);
    }
  }
}

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (err) {
    console.error('[webhook] signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (isEventProcessed(event.id)) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          if (!subscription.metadata?.client_ref && session.client_reference_id) {
            subscription.metadata = { ...(subscription.metadata || {}), client_ref: session.client_reference_id };
            await stripe.subscriptions.update(subscription.id, { metadata: subscription.metadata });
          }
          if (session.customer && session.client_reference_id) {
            try {
              await stripe.customers.update(session.customer, {
                metadata: { client_ref: session.client_reference_id },
              });
            } catch (err) { console.warn('[webhook] customer metadata update failed', err.message); }
          }
          await applySubscriptionUpdate(subscription);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await applySubscriptionUpdate(event.data.object);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          await applySubscriptionUpdate(subscription);
        }
        break;
      }

      default:
        // ignored event types — Stripe sends many we don't care about
        break;
    }

    markEventProcessed(event.id);
    res.json({ received: true });
  } catch (err) {
    console.error('[webhook] handler failed', err);
    res.status(500).json({ error: 'handler_failed', detail: err.message });
  }
});

export default router;
