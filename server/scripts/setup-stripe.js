import 'dotenv/config';
import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error('STRIPE_SECRET_KEY missing. Copy server/.env.example to server/.env and set it first.');
  process.exit(1);
}

const stripe = new Stripe(secretKey, { apiVersion: '2024-12-18.acacia' });

const PLANS = [
  {
    productName: 'SafeCart Premium',
    description: 'Individual subscription for SafeCart',
    metadata: { safecart_tier: 'premium' },
    price: { unit_amount: 249, currency: 'usd', interval: 'month', nickname: 'SafeCart Premium Monthly' },
    envVar: 'STRIPE_PREMIUM_PRICE_ID',
  },
  {
    productName: 'SafeCart Family',
    description: 'Family subscription for up to 5 people',
    metadata: { safecart_tier: 'family' },
    price: { unit_amount: 499, currency: 'usd', interval: 'month', nickname: 'SafeCart Family Monthly' },
    envVar: 'STRIPE_FAMILY_PRICE_ID',
  },
];

async function ensureProduct(plan) {
  const existing = await stripe.products.search({
    query: `active:'true' AND metadata['safecart_tier']:'${plan.metadata.safecart_tier}'`,
  });
  if (existing.data.length > 0) {
    console.log(`✓ Product already exists for ${plan.metadata.safecart_tier}: ${existing.data[0].id}`);
    return existing.data[0];
  }
  const product = await stripe.products.create({
    name: plan.productName,
    description: plan.description,
    metadata: plan.metadata,
  });
  console.log(`+ Created product: ${product.id} (${plan.productName})`);
  return product;
}

async function ensurePrice(product, plan) {
  const existing = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  const matching = existing.data.find(
    (p) =>
      p.unit_amount === plan.price.unit_amount &&
      p.currency === plan.price.currency &&
      p.recurring?.interval === plan.price.interval,
  );
  if (matching) {
    console.log(`✓ Price already exists: ${matching.id}`);
    return matching;
  }
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: plan.price.unit_amount,
    currency: plan.price.currency,
    recurring: { interval: plan.price.interval },
    nickname: plan.price.nickname,
  });
  console.log(`+ Created price: ${price.id} ($${(plan.price.unit_amount / 100).toFixed(2)}/${plan.price.interval})`);
  return price;
}

async function main() {
  console.log('Setting up SafeCart products & prices in Stripe...\n');
  const envLines = [];
  for (const plan of PLANS) {
    const product = await ensureProduct(plan);
    const price = await ensurePrice(product, plan);
    envLines.push(`${plan.envVar}=${price.id}`);
  }
  console.log('\nDone. Add these to your server/.env:\n');
  console.log(envLines.join('\n'));
  console.log('\nNext: configure a webhook endpoint and set STRIPE_WEBHOOK_SECRET.');
  console.log('  Dev:  stripe listen --forward-to localhost:3001/api/webhook');
  console.log('  Prod: Dashboard → Developers → Webhooks → add endpoint /api/webhook');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
