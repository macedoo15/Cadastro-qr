const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function requireEnv(res, names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    json(res, 500, { error: `Missing environment variables: ${missing.join(', ')}` });
    return false;
  }
  return true;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (_) {
    const err = new Error('Invalid JSON body.');
    err.statusCode = 400;
    throw err;
  }
}

async function supabaseFetch(path, options = {}, useServiceRole = false) {
  const key = useServiceRole ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...options.headers,
  };

  return fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers,
  });
}

function getBearer(req) {
  const value = req.headers.authorization || '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

function isAdminUser(user) {
  const email = String(user?.email || '').toLowerCase();
  const role = user?.app_metadata?.role || user?.user_metadata?.role;

  if (ADMIN_EMAILS.length) return ADMIN_EMAILS.includes(email);
  return role === 'admin';
}

async function verifyAdmin(req) {
  const token = getBearer(req);
  if (!token) {
    const err = new Error('Unauthorized.');
    err.statusCode = 401;
    throw err;
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const err = new Error('Invalid session.');
    err.statusCode = 401;
    throw err;
  }

  const user = await response.json();
  if (!isAdminUser(user)) {
    const err = new Error('Forbidden.');
    err.statusCode = 403;
    throw err;
  }

  return { user, token };
}

async function auditLog(evento, detalhe = {}) {
  try {
    await supabaseFetch('/rest/v1/audit_log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        evento,
        detalhe: JSON.stringify(detalhe),
        criado_em: new Date().toISOString(),
      }),
    }, true);
  } catch (_) {
    // Auditing must not break the user-facing flow.
  }
}

module.exports = {
  json,
  requireEnv,
  readBody,
  supabaseFetch,
  verifyAdmin,
  auditLog,
};
