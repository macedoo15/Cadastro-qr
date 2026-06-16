const { json, requireEnv, readBody, verifyAdmin } = require('./_supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  if (!requireEnv(res, ['SUPABASE_URL', 'SUPABASE_ANON_KEY'])) return;

  try {
    const { email, password } = await readBody(req);
    if (!email || !password) return json(res, 400, { error: 'Preencha e-mail e senha.' });

    const authRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await authRes.json().catch(() => ({}));
    if (!authRes.ok || !data.access_token) {
      return json(res, 401, { error: 'E-mail ou senha incorretos. Verifique as credenciais.' });
    }

    await verifyAdmin({ headers: { authorization: `Bearer ${data.access_token}` } });

    return json(res, 200, {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      token_type: data.token_type,
    });
  } catch (err) {
    return json(res, err.statusCode || 500, {
      error: err.statusCode === 403 ? 'Usuario sem permissao administrativa.' : (err.message || 'Erro no login.'),
    });
  }
};
