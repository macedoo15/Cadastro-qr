const { json, requireEnv, verifyAdmin } = require('./_supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  if (!requireEnv(res, ['SUPABASE_URL', 'SUPABASE_ANON_KEY'])) return;

  try {
    const { user } = await verifyAdmin(req);
    return json(res, 200, { email: user.email, id: user.id });
  } catch (err) {
    return json(res, err.statusCode || 500, { error: err.message || 'Invalid session.' });
  }
};
