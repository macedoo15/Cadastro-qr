const { json, requireEnv, verifyAdmin } = require('./_supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  if (!requireEnv(res, ['SUPABASE_URL', 'SUPABASE_ANON_KEY'])) return;

  try {
    const { token } = await verifyAdmin(req);
    await fetch(`${process.env.SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    return json(res, 200, { ok: true });
  } catch (err) {
    return json(res, err.statusCode || 500, { error: err.message || 'Logout failed.' });
  }
};
