// ============================================================
//  auth.js — Configuração do cliente Supabase
// ============================================================

const SUPABASE_URL = 'https://vtbrvwagyhlbuuitwfpe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0YnJ2d2FneWhsYnV1aXR3ZnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NjA2ODgsImV4cCI6MjA5NjUzNjY4OH0.nUBMV8LcQHMCj45ZEFpGZHpV_5pWzCprWRe2X26Jbt0';

// Evita declarar duas vezes caso o script seja carregado mais de uma vez
if (typeof window._supabaseClient === 'undefined') {
  window._supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Alias global usado em login.html e admin.html
const supabaseClient = window._supabaseClient;

// Função de logout
async function sair() {
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}
