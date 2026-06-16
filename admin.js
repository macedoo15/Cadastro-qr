// ============================================================
//  admin.js v2 — Painel com filtros avançados, ordenação e exportação
// ============================================================

const POR_PAGINA = 10;
const API_BASE = '/api';
const ADMIN_TOKEN_KEY = 'admin-auth-token';
let paginaAtual    = 1;
let todosCadastros = [];   // cache completo do Supabase
let filtrados      = [];   // resultado após filtros
let ordemCol       = 'criado_em';
let ordemAsc       = false;

// Estado dos filtros
const filtrosAtivos = { periodo: null, aniv: null };

// ── Autenticação ──
function obterAdminToken() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ADMIN_TOKEN_KEY) || '{}');
    if (parsed.expires_at && parsed.expires_at < Math.floor(Date.now() / 1000)) {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      return '';
    }
    return parsed.access_token || '';
  } catch (_) {
    return '';
  }
}

async function verificarAuth() {
  const token = obterAdminToken();
  if (!token) {
    window.location.href = 'login.html';
    return false;
  }

  const response = await fetch(`${API_BASE}/session`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    window.location.href = 'login.html';
    return false;
  }

  return true;
}

async function lerJsonSeguro(response) {
  const texto = await response.text();
  if (!texto) return {};
  try {
    return JSON.parse(texto);
  } catch (_) {
    return { error: 'Resposta inválida do servidor. Verifique se as rotas /api estão ativas.' };
  }
}

// ── Carregar todos os cadastros ──
async function carregarCadastros() {
  mostrarLoading(true);
  animarRefresh(true);

  const response = await fetch(`${API_BASE}/cadastros`, {
    headers: { Authorization: `Bearer ${obterAdminToken()}` },
  });

  animarRefresh(false);

  if (!response.ok) {
    console.error('Erro ao buscar cadastros:', await lerJsonSeguro(response));
    mostrarErro();
    return;
  }

  const data = await lerJsonSeguro(response);
  todosCadastros = data || [];
  atualizarEstatisticas();
  aplicarFiltros();
}

// ── Estatísticas ──
function atualizarEstatisticas() {
  const agora   = new Date();
  const hoje    = agora.toISOString().slice(0, 10);
  const mesAtual = agora.getMonth() + 1;
  const diaAtual = agora.getDate();

  document.getElementById('total-cadastros').textContent  = todosCadastros.length;
  document.getElementById('total-hoje').textContent       = todosCadastros.filter(c => c.criado_em?.slice(0,10) === hoje).length;
  document.getElementById('total-aniv-mes').textContent   = todosCadastros.filter(c => mesDoNasc(c) === mesAtual).length;
  document.getElementById('total-aniv-hoje').textContent  = todosCadastros.filter(c => {
    const [,m,d] = (c.data_nascimento||'').split('-');
    return +m === mesAtual && +d === diaAtual;
  }).length;
}

// ── Aplicar todos os filtros combinados ──
function aplicarFiltros() {
  const busNome  = document.getElementById('busca-nome').value.toLowerCase().trim();
  const busEmail = document.getElementById('busca-email').value.toLowerCase().trim();
  const busTel   = document.getElementById('busca-tel').value.replace(/\D/g,'');

  const agora    = new Date();
  const hoje     = agora.toISOString().slice(0,10);
  const mesAtual = agora.getMonth() + 1;
  const diaAtual = agora.getDate();

  // Início da semana (segunda)
  const diaSem = agora.getDay() === 0 ? 6 : agora.getDay() - 1;
  const inicioSem = new Date(agora);
  inicioSem.setDate(agora.getDate() - diaSem);
  inicioSem.setHours(0,0,0,0);

  filtrados = todosCadastros.filter(c => {
    // Busca texto
    if (busNome  && !c.nome.toLowerCase().includes(busNome))            return false;
    if (busEmail && !c.email.toLowerCase().includes(busEmail))          return false;
    if (busTel   && !c.telefone.replace(/\D/g,'').includes(busTel))    return false;

    // Filtro período
    const periodo = filtrosAtivos.periodo;
    if (periodo === 'hoje')   { if (c.criado_em?.slice(0,10) !== hoje) return false; }
    if (periodo === '7dias')  { if (new Date(c.criado_em) < new Date(agora - 7*864e5)) return false; }
    if (periodo === '30dias') { if (new Date(c.criado_em) < new Date(agora - 30*864e5)) return false; }
    if (periodo === 'custom') {
      const di = document.getElementById('data-inicio').value;
      const df = document.getElementById('data-fim').value;
      const dt = c.criado_em?.slice(0,10);
      if (di && dt < di) return false;
      if (df && dt > df) return false;
    }

    // Filtro aniversariantes
    const aniv = filtrosAtivos.aniv;
    if (aniv) {
      const [,m,d] = (c.data_nascimento||'').split('-');
      const mes = +m, dia = +d;
      if (aniv === 'aniv-hoje')   { if (mes !== mesAtual || dia !== diaAtual) return false; }
      if (aniv === 'aniv-semana') {
        // verifica se o aniversário cai dentro dos próximos 7 dias
        const aniData = new Date(agora.getFullYear(), mes-1, dia);
        if (aniData < inicioSem || aniData > new Date(inicioSem.getTime() + 7*864e5)) return false;
      }
      if (aniv === 'aniv-mes')    { if (mes !== mesAtual) return false; }
      if (aniv.startsWith('mes-')) { if (mes !== +aniv.split('-')[1]) return false; }
    }

    return true;
  });

  // Ordenação
  filtrados.sort((a, b) => {
    let va = a[ordemCol] || '';
    let vb = b[ordemCol] || '';
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return ordemAsc ? -1 : 1;
    if (va > vb) return ordemAsc ? 1 : -1;
    return 0;
  });

  // Atualiza label de resultado
  document.getElementById('resultado-label').textContent =
    `${filtrados.length} registro${filtrados.length !== 1 ? 's' : ''} encontrado${filtrados.length !== 1 ? 's' : ''}`;

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
    tbody.innerHTML = '';
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

  // Verificar se é aniversariante hoje
  const agora    = new Date();
  const mesAtual = agora.getMonth() + 1;
  const diaAtual = agora.getDate();

  tbody.innerHTML = paginaDados.map((c, i) => {
    const idx = todosCadastros.indexOf(c);
    const [,m,d] = (c.data_nascimento||'').split('-');
    const ehAniv = +m === mesAtual && +d === diaAtual;
    return `
      <tr class="table-row ${ehAniv ? 'row-aniv' : ''}" onclick="abrirModal(${idx})">
        <td class="td-num">${inicio + i + 1}</td>
        <td class="td-nome">
          <div class="avatar">${iniciais(c.nome)}</div>
          <span>${escHtml(c.nome)} ${ehAniv ? '<span class="badge-aniv">🎂 Aniversário!</span>' : ''}</span>
        </td>
        <td class="td-email">${escHtml(c.email)}</td>
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

// ── Ordenação por coluna ──
function ordenar(col) {
  if (ordemCol === col) ordemAsc = !ordemAsc;
  else { ordemCol = col; ordemAsc = true; }

  // Resetar ícones
  document.querySelectorAll('[id^="sort-"]').forEach(el => {
    el.className = 'ti ti-arrows-sort';
  });
  const ico = document.getElementById('sort-' + col);
  if (ico) ico.className = ordemAsc ? 'ti ti-sort-ascending' : 'ti ti-sort-descending';

  aplicarFiltros();
}

// ── Filtros: chips ──
function selecionarChip(btn) {
  const grupo = btn.dataset.filtro;
  const val   = btn.dataset.val;

  // Toggle: clicou no mesmo = desativa
  if (filtrosAtivos[grupo] === val) {
    filtrosAtivos[grupo] = null;
    btn.classList.remove('chip-ativo');
  } else {
    // Desativa todos do mesmo grupo
    document.querySelectorAll(`.chip[data-filtro="${grupo}"]`).forEach(b => b.classList.remove('chip-ativo'));
    filtrosAtivos[grupo] = val;
    btn.classList.add('chip-ativo');
  }

  // Mostrar/esconder inputs de data personalizada
  document.getElementById('custom-datas').style.display =
    filtrosAtivos.periodo === 'custom' ? 'flex' : 'none';

  aplicarFiltros();
}

function limparFiltros() {
  filtrosAtivos.periodo = null;
  filtrosAtivos.aniv    = null;
  document.querySelectorAll('.chip').forEach(b => b.classList.remove('chip-ativo'));
  document.getElementById('custom-datas').style.display = 'none';
  document.getElementById('busca-nome').value  = '';
  document.getElementById('busca-email').value = '';
  document.getElementById('busca-tel').value   = '';
  aplicarFiltros();
}

function toggleFiltros() {
  const body    = document.getElementById('filtros-body');
  const chevron = document.getElementById('filtros-chevron');
  const aberto  = body.style.display !== 'none';
  body.style.display    = aberto ? 'none' : 'block';
  chevron.className     = aberto ? 'ti ti-chevron-down' : 'ti ti-chevron-up';
}

// ── Modal ──
function abrirModal(index) {
  const c = todosCadastros[index];
  if (!c) return;

  const agora    = new Date();
  const [,m,d]   = (c.data_nascimento||'').split('-');
  const ehAniv   = +m === (agora.getMonth()+1) && +d === agora.getDate();

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-avatar">${iniciais(c.nome)}</div>
    ${ehAniv ? '<p style="color:#D97706;font-weight:600;margin-bottom:6px;">🎂 Aniversariante hoje!</p>' : ''}
    <h3 class="modal-nome">${escHtml(c.nome)}</h3>
    <div class="modal-grid">
      <div class="modal-field">
        <span class="modal-label"><i class="ti ti-mail"></i> E-mail</span>
        <span class="modal-value">${escHtml(c.email)}</span>
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

function fecharModal(e) { if (e.target === document.getElementById('modal')) fecharModalBtn(); }
function fecharModalBtn() {
  document.getElementById('modal').classList.remove('open');
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModalBtn(); });

// ── Exportação ──
function abrirExport() {
  const menu = document.getElementById('export-menu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('click', e => {
  if (!e.target.closest('.export-group')) {
    document.getElementById('export-menu').style.display = 'none';
  }
});

function exportar(tipo, formato) {
  document.getElementById('export-menu').style.display = 'none';
  const agora    = new Date();
  const mesAtual = agora.getMonth() + 1;
  const diaAtual = agora.getDate();

  let dados = [];
  let nomeArq = '';

  if (tipo === 'todos') {
    dados   = todosCadastros;
    nomeArq = 'cadastros_todos';
  } else if (tipo === 'filtrados') {
    dados   = filtrados;
    nomeArq = 'cadastros_filtrados';
  } else if (tipo === 'aniv-hoje') {
    dados   = todosCadastros.filter(c => {
      const [,m,d] = (c.data_nascimento||'').split('-');
      return +m === mesAtual && +d === diaAtual;
    });
    nomeArq = 'aniversariantes_hoje';
  } else if (tipo === 'aniv-semana') {
    const diaSem = agora.getDay() === 0 ? 6 : agora.getDay() - 1;
    const inicioSem = new Date(agora); inicioSem.setDate(agora.getDate()-diaSem); inicioSem.setHours(0,0,0,0);
    dados = todosCadastros.filter(c => {
      const [,m,d] = (c.data_nascimento||'').split('-');
      const aniData = new Date(agora.getFullYear(), +m-1, +d);
      return aniData >= inicioSem && aniData <= new Date(inicioSem.getTime()+7*864e5);
    });
    nomeArq = 'aniversariantes_semana';
  } else if (tipo === 'aniv-mes') {
    dados   = todosCadastros.filter(c => mesDoNasc(c) === mesAtual);
    nomeArq = 'aniversariantes_mes';
  }

  if (dados.length === 0) { mostrarToast('Nenhum dado para exportar.', 'erro'); return; }

  const cab  = ['Nome','E-mail','Data de Nascimento','Telefone','Cadastrado em'];
  const rows = dados.map(c => [
    c.nome, c.email,
    formatarData(c.data_nascimento),
    c.telefone,
    formatarDataHora(c.criado_em)
  ]);

  const nomeCompleto = `${nomeArq}_${agora.toISOString().slice(0,10)}`;

  if (formato === 'csv') {
    const csv  = [cab, ...rows].map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' });
    baixarBlob(blob, nomeCompleto+'.csv');
  } else {
    const wb  = XLSX.utils.book_new();
    const ws  = XLSX.utils.aoa_to_sheet([cab, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, 'Cadastros');
    XLSX.writeFile(wb, nomeCompleto+'.xlsx');
  }

  mostrarToast(`${dados.length} registro${dados.length!==1?'s':''} exportado${dados.length!==1?'s':''}!`, 'ok');
}

function baixarBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}

// ── Realtime ──
function iniciarRealtime() {
  setInterval(async () => {
    const totalAntes = todosCadastros.length;
    await carregarCadastros();
    if (todosCadastros.length > totalAntes) {
      const badge = document.getElementById('realtime-badge');
      if (badge) {
        badge.classList.add('pulse');
        setTimeout(() => badge.classList.remove('pulse'), 2000);
      }
      mostrarToast('Novo cadastro recebido!', 'ok');
    }
  }, 30000);
}

// ── Toast ──
function mostrarToast(msg, tipo) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast toast-${tipo} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Utilitários ──
function mesDoNasc(c) { return +((c.data_nascimento||'').split('-')[1]); }
function iniciais(nome) { return nome.trim().split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase(); }
function escHtml(str) {
  return String(str||'')
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
  return new Date(str).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
}
function mostrarLoading(show) {
  document.getElementById('loading-state').style.display = show ? 'flex' : 'none';
  document.getElementById('tabela-body').innerHTML = '';
  document.getElementById('empty-state').style.display  = 'none';
  document.getElementById('paginacao').style.display    = 'none';
}
function mostrarErro() {
  document.getElementById('loading-state').style.display = 'none';
  const el = document.getElementById('empty-state');
  el.style.display = 'flex';
  el.innerHTML = `<i class="ti ti-alert-circle"></i><p>Erro ao carregar</p><span>Verifique as permissões no Supabase.</span>`;
}
function animarRefresh(ativo) {
  const ico = document.getElementById('icon-refresh');
  if (ativo) ico.classList.add('spin'); else ico.classList.remove('spin');
}

// ── Init ──
(async () => {
  const autenticado = await verificarAuth();
  if (!autenticado) return;
  await carregarCadastros();
  iniciarRealtime();
})();
