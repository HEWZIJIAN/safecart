// =============================================================================
// SafeCart auth middleware (Workers)
// -----------------------------------------------------------------------------
// Validates the Supabase access token by asking Supabase directly via its
// /auth/v1/user endpoint. More robust than local JWT verification because it
// works regardless of whether Supabase uses HS256 (legacy) or asymmetric
// JWT signing keys.
// =============================================================================

export async function authMiddleware(c, next) {
  const header = c.req.header('Authorization') || '';
  if (!header.startsWith('Bearer ')) {
    return c.json({ error: 'missing_authorization' }, 401);
  }
  const token = header.slice(7).trim();
  if (!token) return c.json({ error: 'missing_token' }, 401);

  try {
    const response = await fetch(`${c.env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: c.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });

    if (!response.ok) {
      return c.json(
        { error: 'invalid_token', detail: `supabase_${response.status}` },
        401,
      );
    }

    const user = await response.json();
    if (!user?.id) {
      return c.json({ error: 'invalid_token', detail: 'no_user_id' }, 401);
    }

    c.set('userId', user.id);
    c.set('email', user.email || null);
    c.set('jwtPayload', user);
    return next();
  } catch (err) {
    return c.json({ error: 'invalid_token', detail: err.message }, 401);
  }
}