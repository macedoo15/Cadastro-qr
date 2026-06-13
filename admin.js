// ============================================================
//  admin.js — Lógica completa do painel administrativo
// ============================================================

const POR_PAGINA = 10;
let paginaAtual    = 1;
let todosCadastros = [];
let filtrados      = [];

// ── Autenticação ──
async function verificarAuth() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) window.location.href = 'login.html';
}

// ── Carregar cadastros ──
async function carregarCadastros() {
  mostrarLoading(true);
  animarRefresh(true);

  const { data, error } = await supabaseClient
    .from('cadastros')
    .select('*')
    .order('criado_em', { ascending: false });

  animarRefresh(false);

  if (error) {
    console.error('Erro ao buscar cadastros:', error);
    mostrarErro();
    return;
  }

  todosCadastros = data || [];
  atualizarEstatisticas();
  filtrar();
}

// ── Estatísticas ──
function atualizarEstatisticas() {
  const agora    = new Date();
  const hoje     = agora.toISOString().slice(0, 10);
  const diaSem   = agora.getDay() === 0 ? 6 : agora.getDay() - 1;
  const inicioSem = new Date(agora);
  inicioSem.setDate(agora.getDate() - diaSem);
  inicioSem.setHours(0, 0, 0, 0);

  document.getElementById('total-cadastros').textContent = todosCadastros.length;
  document.getElementById('total-hoje').textContent      = todosCadastros.filter(c => c.criado_em?.slice(0,10) === hoje).length;
  document.getElementById('total-semana').textContent    = todosCadastros.filter(c => new Date(c.criado_em) >= inicioSem).length;
}

// ── Filtro ──
function filtrar() {
  const nome = document.getElementById('busca-nome').value.toLowerCase().trim();
  const cpf  = document.getElementById('busca-cpf').value.replace(/\D/g, '');

  filtrados = todosCadastros.filter(c => {
    const matchNome = !nome || c.nome.toLowerCase().includes(nome);
    const matchCpf  = !cpf  || c.cpf.replace(/\D/g, '').includes(cpf);
    return matchNome && matchCpf;
  });

  paginaAtual = 1;
  renderizarTabela();
}

// ── Renderizar tabela ──
function renderizarTabela() {
  const tbody     = document.getElementById('tabela-body');
  const emptyEl   = document.getElementById('empty-state');
  const loadingEl = document.getElementById('loading-state');
  const paginacao = document.getElementById('paginacao');

  loadingEl.style.display = 'none';

  if (filtrados.length === 0) {
    tbody.innerHTML        = '';
    emptyEl.style.display  = 'flex';
    paginacao.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';

  const total        = filtrados.length;
  const inicio       = (paginaAtual - 1) * POR_PAGINA;
  const fim          = Math.min(inicio + POR_PAGINA, total);
  const paginaDados  = filtrados.slice(inicio, fim);
  const totalPaginas = Math.ceil(total / POR_PAGINA);

  tbody.innerHTML = paginaDados.map((c, i) => {
    const idx = todosCadastros.indexOf(c);
    return `
      <tr class="table-row" onclick="abrirModal(${idx})">
        <td class="td-num">${inicio + i + 1}</td>
        <td class="td-nome">
          <div class="avatar">${iniciais(c.nome)}</div>
          <span>${escHtml(c.nome)}</span>
        </td>
        <td class="td-email">${escHtml(c.email)}</td>
        <td>${escHtml(c.cpf)}</td>
        <td>${formatarData(c.data_nascimento)}</td>
        <td>${escHtml(c.telefone)}</td>
        <td>${formatarDataHora(c.criado_em)}</td>
        <td>
          <button class="btn-detalhe" onclick="event.stopPropagation(); abrirModal(${idx})">
            <i class="ti ti-eye"></i> Ver
          </button>
        </td>
      </tr>
    `;
  }).join('');

  paginacao.style.display = 'flex';
  document.getElementById('page-info').textContent  = `Página ${paginaAtual} de ${totalPaginas} — ${total} registro${total !== 1 ? 's' : ''}`;
  document.getElementById('btn-prev').disabled = paginaAtual === 1;
  document.getElementById('btn-next').disabled = paginaAtual === totalPaginas;
}

function mudarPagina(dir) {
  const totalPaginas = Math.ceil(filtrados.length / POR_PAGINA);
  paginaAtual = Math.max(1, Math.min(paginaAtual + dir, totalPaginas));
  renderizarTabela();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Modal ──
function abrirModal(index) {
  const c = todosCadastros[index];
  if (!c) return;

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-avatar">${iniciais(c.nome)}</div>
    <h3 class="modal-nome">${escHtml(c.nome)}</h3>
    <div class="modal-grid">
      <div class="modal-field">
        <span class="modal-label"><i class="ti ti-mail"></i> E-mail</span>
        <span class="modal-value">${escHtml(c.email)}</span>
      </div>
      <div class="modal-field">
        <span class="modal-label"><i class="ti ti-id-badge"></i> CPF</span>
        <span class="modal-value">${escHtml(c.cpf)}</span>
      </div>
      <div class="modal-field">
        <span class="modal-label"><i class="ti ti-calendar"></i> Nascimento</span>
        <span class="modal-value">${formatarData(c.data_nascimento)}</span>
      </div>
      <div class="modal-field">
        <span class="modal-label"><i class="ti ti-phone"></i> Telefone</span>
        <span class="modal-value">${escHtml(c.telefone)}</span>
      </div>
      <div class="modal-field modal-field-full">
        <span class="modal-label"><i class="ti ti-clock"></i> Cadastrado em</span>
        <span class="modal-value">${formatarDataHora(c.criado_em)}</span>
      </div>
    </div>
  `;

  document.getElementById('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function fecharModal(event) {
  if (event.target === document.getElementById('modal')) fecharModalBtn();
}

function fecharModalBtn() {
  document.getElementById('modal').classList.remove('open');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') fecharModalBtn();
});

// ── Exportar CSV ──
function exportarCSV() {
  if (todosCadastros.length === 0) { alert('Nenhum dado para exportar.'); return; }

  const cab   = ['Nome','E-mail','CPF','Data de Nascimento','Telefone','Cadastrado em'];
  const linhas = todosCadastros.map(c => [
    c.nome, c.email, c.cpf,
    formatarData(c.data_nascimento),
    c.telefone,
    formatarDataHora(c.criado_em)
  ]);

  const csv  = [cab, ...linhas].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `cadastros_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Realtime ──
function iniciarRealtime() {
  supabaseClient
    .channel('cadastros-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cadastros' }, payload => {
      todosCadastros.unshift(payload.new);
      atualizarEstatisticas();
      filtrar();
      const badge = document.getElementById('realtime-badge');
      badge.classList.add('pulse');
      setTimeout(() => badge.classList.remove('pulse'), 2000);
    })
    .subscribe();
}

// ── Utilitários ──
function iniciais(nome) {
  return nome.trim().split(' ').map(p => p[0]).slice(0,2).join('').toUpperCase();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatarData(str) {
  if (!str) return '—';
  const [y,m,d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function formatarDataHora(str) {
  if (!str) return '—';
  return new Date(str).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' });
}

function mostrarLoading(show) {
  document.getElementById('loading-state').style.display = show ? 'flex' : 'none';
  document.getElementById('tabela-body').innerHTML = '';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('paginacao').style.display = 'none';
}

function mostrarErro() {
  document.getElementById('loading-state').style.display = 'none';
  document.getElementById('empty-state').style.display = 'flex';
  document.getElementById('empty-state').innerHTML = `
    <i class="ti ti-alert-circle"></i>
    <p>Erro ao carregar</p>
    <span>Nao foi possivel carregar os cadastros. Verifique as permissoes da tabela no Supabase.</span>
  `;
}

function animarRefresh(ativo) {
  const ico = document.getElementById('icon-refresh');
  if (ativo) ico.classList.add('spin');
  else ico.classList.remove('spin');
}

// ── Init ──
(async () => {
  await verificarAuth();
  await carregarCadastros();
  iniciarRealtime();
})();