// ============================================================
//  auth.js - helpers de sessao sem chaves sensiveis no frontend
// ============================================================

const TOKEN_KEY = 'admin-auth-token';

function obterTokenAuth() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) || '{}').access_token || '';
  } catch (_) {
    return '';
  }
}

function limparTokenAuth() {
  localStorage.removeItem(TOKEN_KEY);
}

async function sair() {
  const token = obterTokenAuth();
  try {
    if (token) {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } catch (_) {}

  limparTokenAuth();
  window.location.href = 'login.html';
}
