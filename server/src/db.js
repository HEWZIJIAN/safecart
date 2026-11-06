import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';

const dbPath = path.resolve(config.dbPath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    client_ref TEXT PRIMARY KEY,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    tier TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'inactive',
    current_period_end INTEGER,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(stripe_customer_id);
  CREATE INDEX IF NOT EXISTS idx_subscriptions_subscription ON subscriptions(stripe_subscription_id);

  CREATE TABLE IF NOT EXISTS processed_events (
    event_id TEXT PRIMARY KEY,
    received_at INTEGER NOT NULL
  );
`);

const stmts = {
  getByRef: db.prepare('SELECT * FROM subscriptions WHERE client_ref = ?'),
  getBySubscriptionId: db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?'),
  getByCustomerId: db.prepare('SELECT * FROM subscriptions WHERE stripe_customer_id = ?'),
  upsert: db.prepare(`
    INSERT INTO subscriptions (client_ref, stripe_customer_id, stripe_subscription_id, tier, status, current_period_end, cancel_at_period_end, created_at, updated_at)
    VALUES (@client_ref, @stripe_customer_id, @stripe_subscription_id, @tier, @status, @current_period_end, @cancel_at_period_end, @now, @now)
    ON CONFLICT(client_ref) DO UPDATE SET
      stripe_customer_id     = COALESCE(excluded.stripe_customer_id, stripe_customer_id),
      stripe_subscription_id = COALESCE(excluded.stripe_subscription_id, stripe_subscription_id),
      tier                   = excluded.tier,
      status                 = excluded.status,
      current_period_end     = COALESCE(excluded.current_period_end, current_period_end),
      cancel_at_period_end   = excluded.cancel_at_period_end,
      updated_at             = excluded.updated_at
  `),
  updateByCustomer: db.prepare(`
    UPDATE subscriptions
       SET stripe_subscription_id = @stripe_subscription_id,
           tier                   = @tier,
           status                 = @status,
           current_period_end     = @current_period_end,
           cancel_at_period_end   = @cancel_at_period_end,
           updated_at             = @now
     WHERE stripe_customer_id = @stripe_customer_id
  `),
  markEvent: db.prepare('INSERT OR IGNORE INTO processed_events (event_id, received_at) VALUES (?, ?)'),
  hasEvent: db.prepare('SELECT 1 FROM processed_events WHERE event_id = ?'),
};

export function getSubscriptionByRef(clientRef) {
  return stmts.getByRef.get(clientRef);
}

export function getSubscriptionBySubscriptionId(stripeSubscriptionId) {
  return stmts.getBySubscriptionId.get(stripeSubscriptionId);
}

export function getSubscriptionByCustomerId(customerId) {
  return stmts.getByCustomerId.get(customerId);
}

export function upsertSubscription(row) {
  const now = Date.now();
  stmts.upsert.run({
    stripe_customer_id: null,
    stripe_subscription_id: null,
    tier: 'free',
    status: 'inactive',
    current_period_end: null,
    cancel_at_period_end: 0,
    ...row,
    now,
  });
  return stmts.getByRef.get(row.client_ref);
}

export function updateByCustomer(row) {
  const now = Date.now();
  return stmts.updateByCustomer.run({ ...row, now }).changes;
}

export function markEventProcessed(eventId) {
  return stmts.markEvent.run(eventId, Date.now()).changes > 0;
}

export function isEventProcessed(eventId) {
  return Boolean(stmts.hasEvent.get(eventId));
}
