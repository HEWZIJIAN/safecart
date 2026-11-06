import Stripe from 'stripe';
import { config } from './config.js';

export const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2024-12-18.acacia',
  appInfo: { name: 'SafeCart', version: '0.1.0' },
});
