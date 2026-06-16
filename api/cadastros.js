const {
  json,
  requireEnv,
  readBody,
  supabaseFetch,
  verifyAdmin,
  auditLog,
} = require('./_supabase');

const IDADE_MINIMA = 18;

function normEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normTel(value) {
  return String(value || '').replace(/\D/g, '');
}

function validarNome(value) {
  const v = String(value || '').trim();
  if (!v || v.length > 60) return false;
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/.test(v)) return false;
  return v.split(/\s+/).filter((part) => part.length >= 2).length >= 2;
}

function validarEmail(value) {
  const v = normEmail(value);
  if (!v || v.includes('..') || v.startsWith('.') || /\.@/.test(v) || /^[^@]*@\./.test(v)) return false;
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(v);
}

function idadeAnos(ano, mes, dia) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const nasc = new Date(ano, mes - 1, dia);
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const aindaNaoFezAniversario =
    (hoje.getMonth() < nasc.getMonth()) ||
    (hoje.getMonth() === nasc.getMonth() && hoje.getDate() < nasc.getDate());
  if (aindaNaoFezAniversario) idade--;
  return idade;
}

function validarNasc(value) {
  if (!value) return false;
  const [ano, mes, dia] = String(value).split('-').map(Number);
  if (!ano || !mes || !dia) return false;
  const date = new Date(ano, mes - 1, dia);
  if (date.getFullYear() !== ano || date.getMonth() !== mes - 1 || date.getDate() !== dia) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  if (date > hoje) return false; // data futura nunca e valida
  const limiteMin = new Date(hoje);
  limiteMin.setFullYear(limiteMin.getFullYear() - 120);
  if (date < limiteMin) return false;
  return idadeAnos(ano, mes, dia) >= IDADE_MINIMA;
}

function validarTel(value) {
  const d = normTel(value);
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  const dddsValidos = [
    11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,
    41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,
    71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99,
  ];
  const num = d.slice(2);
  if (!dddsValidos.includes(ddd)) return false;
  if (d.length === 11 && num[0] !== '9') return false;
  if (/^(\d)\1+$/.test(d) || /^(\d)\1+$/.test(num)) return false;
  return num !== '12345678' && num !== '987654321';
}

async function verifyTurnstile(token, remoteIp) {
  if (!token) return { ok: false, error: 'Token do Turnstile ausente.' };

  const body = new URLSearchParams();
  const secret = process.env.TURNSTILE_SECRET_KEY;
  body.set('response', token);
  body.set('secret', secret);
  if (remoteIp) body.set('remoteip', remoteIp);

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    const data = await response.json().catch(() => ({}));
    return {
      ok: data.success === true,
      error: Array.isArray(data['error-codes']) && data['error-codes'].length
        ? `Turnstile recusou o token: ${data['error-codes'].join(', ')}`
        : 'Verificacao de seguranca invalida. Tente novamente.',
    };
  } catch (err) {
    return { ok: false, error: `Falha ao validar Turnstile: ${err.message}` };
  }
}

async function hasDuplicate(email, telNorm) {
  const emailRes = await supabaseFetch(
    `/rest/v1/cadastros?email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
    {},
    true,
  );
  const emailData = await emailRes.json().catch(() => []);
  if (!emailRes.ok) throw new Error('Nao foi possivel verificar duplicidade por e-mail.');
  if (Array.isArray(emailData) && emailData.length > 0) return true;

  const telRes = await supabaseFetch(
    `/rest/v1/cadastros?telefone_normalizado=eq.${encodeURIComponent(telNorm)}&select=id&limit=1`,
    {},
    true,
  );
  const telData = await telRes.json().catch(() => []);
  if (!telRes.ok) throw new Error('Nao foi possivel verificar duplicidade por telefone.');
  return Array.isArray(telData) && telData.length > 0;
}

async function listCadastros(req, res) {
  if (!requireEnv(res, ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])) return;
  await verifyAdmin(req);

  const response = await supabaseFetch(
    '/rest/v1/cadastros?select=id,nome,email,telefone,data_nascimento,criado_em&order=criado_em.desc',
    {},
    true,
  );

  const data = await response.json().catch(() => []);
  if (!response.ok) return json(res, response.status, { error: data.message || 'Erro ao carregar dados.' });
  return json(res, 200, data);
}

async function createCadastro(req, res) {
  if (!requireEnv(res, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'TURNSTILE_SECRET_KEY'])) return;

  const body = await readBody(req);
  const nome = String(body.nome || '').trim();
  const email = normEmail(body.email);
  const dataNascimento = body.data_nascimento;
  const telefone = String(body.telefone || '').trim();
  const telefoneNormalizado = normTel(telefone);

  const captcha = await verifyTurnstile(body.turnstileToken, req.headers['x-forwarded-for']);
  if (!captcha.ok) {
    await auditLog('CAPTCHA_INVALIDO', { email, telefoneNormalizado });
    return json(res, 400, { error: captcha.error });
  }

  if (!validarNome(nome)) {
    await auditLog('VALIDACAO_FALHOU', { email, telefoneNormalizado, motivo: 'nome' });
    return json(res, 400, { error: 'Nome invalido. Use nome e sobrenome, com no maximo 60 caracteres.' });
  }

  if (!validarEmail(email)) {
    await auditLog('VALIDACAO_FALHOU', { email, telefoneNormalizado, motivo: 'email' });
    return json(res, 400, { error: 'E-mail invalido.' });
  }

  if (!validarNasc(dataNascimento)) {
    await auditLog('VALIDACAO_FALHOU', { email, telefoneNormalizado, motivo: 'data_nascimento' });
    return json(res, 400, { error: `E necessario ter ${IDADE_MINIMA} anos ou mais para se cadastrar.` });
  }

  if (!validarTel(telefone)) {
    await auditLog('VALIDACAO_FALHOU', { email, telefoneNormalizado, motivo: 'telefone' });
    return json(res, 400, { error: 'Telefone invalido.' });
  }

  if (await hasDuplicate(email, telefoneNormalizado)) {
    await auditLog('CADASTRO_DUPLICADO', { email, telefoneNormalizado });
    return json(res, 409, { error: 'Este usuario ja possui um cadastro em nosso sistema.' });
  }

  const response = await supabaseFetch('/rest/v1/cadastros', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      nome,
      email,
      data_nascimento: dataNascimento,
      telefone,
      telefone_normalizado: telefoneNormalizado,
    }),
  }, true);

  if (!response.ok) {
    const erro = await response.json().catch(() => ({}));
    await auditLog('ERRO_ENVIO', { email, telefoneNormalizado, erro: erro.message || response.statusText });
    if (erro.code === '23505') return json(res, 409, { error: 'Este usuario ja possui um cadastro em nosso sistema.' });
    return json(res, response.status, {
      error: erro.message || `Supabase retornou HTTP ${response.status}. Confira SUPABASE_SERVICE_ROLE_KEY e a tabela cadastros.`,
    });
  }

  await auditLog('CADASTRO_SUCESSO', { email, telefoneNormalizado });
  return json(res, 201, { ok: true });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') return await listCadastros(req, res);
    if (req.method === 'POST') return await createCadastro(req, res);
    return json(res, 405, { error: 'Method not allowed.' });
  } catch (err) {
    return json(res, err.statusCode || 500, { error: err.message || 'Erro inesperado.' });
  }
};