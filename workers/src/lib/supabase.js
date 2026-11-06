// Direct PostgREST calls against Supabase using the service-role key.
// Service-role bypasses RLS — so this code MUST only run server-side.

function headers(env, prefer) {
  const h = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) h.Prefer = prefer;
  return h;
}

export async function getSubscriptionByUserId(env, userId) {
  const url = `${env.SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=*`;
  const res = await fetch(url, { headers: headers(env) });
  if (!res.ok) throw new Error(`supabase_get_${res.status}`);
  const rows = await res.json();
  return rows[0] || null;
}

export async function getSubscriptionByStripeCustomerId(env, customerId) {
  const url = `${env.SUPABASE_URL}/rest/v1/subscriptions?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=*`;
  const res = await fetch(url, { headers: headers(env) });
  if (!res.ok) throw new Error(`supabase_get_${res.status}`);
  const rows = await res.json();
  return rows[0] || null;
}

export async function upsertSubscription(env, row) {
  const url = `${env.SUPABASE_URL}/rest/v1/subscriptions?on_conflict=user_id`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(env, 'resolution=merge-duplicates,return=representation'),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`supabase_upsert_${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows[0] || null;
}

export async function isEventProcessed(env, eventId) {
  const url = `${env.SUPABASE_URL}/rest/v1/processed_events?event_id=eq.${encodeURIComponent(eventId)}&select=event_id`;
  const res = await fetch(url, { headers: headers(env) });
  if (!res.ok) return false;
  const rows = await res.json();
  return rows.length > 0;
}

export async function markEventProcessed(env, eventId) {
  const url = `${env.SUPABASE_URL}/rest/v1/processed_events`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(env, 'resolution=ignore-duplicates,return=minimal'),
    body: JSON.stringify({ event_id: eventId }),
  });
  return res.ok;
}
