// ================================================
// Essencial Modas - scripts.js (Supabase)
// ================================================

// Preencha com os dados do seu projeto: Supabase > Project Settings > API
const SUPABASE_URL      = 'https://SEU-PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA-ANON-KEY';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

// Filtro "ilike" em varias colunas; remove caracteres que quebram a sintaxe do .or()
function buscaOr(qr, cols, termo) {
  const t = String(termo || '').replace(/[,()%*\\]/g, ' ').trim();
  if (!t) return qr;
  return qr.or(cols.map(c => `${c}.ilike.%${t}%`).join(','));
}

// ── DATAS (fuso local) ───────────────────────────
function diaLocal(d = new Date()) {
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}
function inicioDia(ymd) { return new Date(ymd + 'T00:00:00').toISOString(); }
function fimDia(ymd)    { const d = new Date(ymd + 'T00:00:00'); d.setDate(d.getDate() + 1); return d.toISOString(); }
function fmtDate(ymd)   { return ymd ? new Date(String(ymd).slice(0, 10) + 'T12:00').toLocaleDateString('pt-BR') : '-'; }
function addDias(n)     { const d = new Date(); d.setDate(d.getDate() + n); return diaLocal(d); }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── ACOES DE DADOS ───────────────────────────────
const ACTIONS = {
  async getConfig() {
    const c = await run(sb.from('config').select('*').eq('id', 1).maybeSingle());
    return c ? { ...c, end: c.endereco } : {};
  },
  salvarConfig: c => run(sb.from('config').upsert({
    id: 1, nome: c.nome, cnpj: c.cnpj, tel: c.tel, cidade: c.cidade, endereco: c.end,
    j2: c.j2, j3: c.j3, j6: c.j6, j12: c.j12
  })),

  listarProdutos: ({ q = '' }) => run(buscaOr(sb.from('produtos').select('*').order('nome'), ['nome', 'barcode'], q)),
  salvarProduto: p => run(sb.from('produtos').insert({
    nome: p.nome, categoria: p.categoria, tamanho: p.tamanho, cor: p.cor,
    custo: +p.custo || 0, preco: +p.preco, estoque: parseInt(p.estoque) || 0,
    barcode: p.barcode || gerarBarcode()
  })),
  deletarProduto: ({ id }) => run(sb.from('produtos').delete().eq('id', id)),

  async listarClientes({ q = '' }) {
    const rows = await run(buscaOr(sb.from('clientes').select('*').order('nome'), ['nome', 'cpf', 'tel'], q));
    return rows.map(c => ({ ...c, end: c.endereco }));
  },
  salvarCliente: c => run(sb.from('clientes').insert({
    nome: c.nome, cpf: c.cpf, tel: c.tel, email: c.email, nasc: c.nasc || null, endereco: c.end, obs: c.obs
  })),
  deletarCliente: ({ id }) => run(sb.from('clientes').delete().eq('id', id)),

  listarFuncionarios: ({ q = '' }) => run(buscaOr(sb.from('funcionarios').select('*').order('nome'), ['nome', 'cargo'], q)),
  salvarFuncionario: f => run(sb.from('funcionarios').insert({
    nome: f.nome, cpf: f.cpf, cargo: f.cargo, tel: f.tel, salario: +f.salario || 0,
    admissao: f.admissao || null, comissao: +f.comissao || 0, email: f.email
  })),
  deletarFuncionario: ({ id }) => run(sb.from('funcionarios').delete().eq('id', id)),

  listarFinanceiro({ q = '', tipo = '' }) {
    let qr = sb.from('financeiro').select('*').order('data', { ascending: false }).order('id', { ascending: false });
    if (tipo) qr = qr.eq('tipo', tipo);
    return run(buscaOr(qr, ['descricao', 'categoria'], q));
  },
  salvarFinanceiro: f => run(sb.from('financeiro').insert({
    tipo: f.tipo, categoria: f.categoria, descricao: f.descricao, valor: Math.abs(+f.valor), data: f.data || diaLocal()
  })),
  deletarFinanceiro: ({ id }) => run(sb.from('financeiro').delete().eq('id', id)),
  async resumoFinanceiro() {
    const rows = await run(sb.from('financeiro').select('tipo, valor'));
    const soma = tipo => rows.filter(r => r.tipo === tipo).reduce((s, r) => s + +r.valor, 0);
    const receitas = soma('Receita'), despesas = soma('Despesa');
    return { receitas, despesas, saldo: receitas - despesas };
  },

  listarVendas({ q = '', data = '' }) {
    let qr = buscaOr(sb.from('vendas').select('*').order('data', { ascending: false }), ['cliente', 'pgto'], q);
    if (data) qr = qr.gte('data', inicioDia(data)).lt('data', fimDia(data));
    return run(qr);
  },
  getVenda: ({ id }) => run(sb.from('vendas').select('*').eq('id', id).single()),
  registrarVenda: v => run(sb.rpc('registrar_venda', { p: v })),

  async relatorio({ ini, fim, pgto }) {
    let qr = sb.from('vendas').select('*');
    if (ini)  qr = qr.gte('data', inicioDia(ini));
    if (fim)  qr = qr.lt('data', fimDia(fim));
    if (pgto) qr = qr.eq('forma', pgto);
    const vendas = await run(qr);
    const total = vendas.reduce((s, v) => s + +v.total, 0);
    const porPgto = {}, porProd = {};
    let qtdItens = 0;
    vendas.forEach(v => {
      porPgto[v.forma] = (porPgto[v.forma] || 0) + +v.total;
      (v.itens || []).forEach(i => {
        qtdItens += i.qty;
        const p = porProd[i.nome] || (porProd[i.nome] = { qty: 0, total: 0 });
        p.qty += i.qty;
        p.total += i.preco * i.qty;
      });
    });
    return { total, qtdVendas: vendas.length, qtdItens, ticketMedio: vendas.length ? total / vendas.length : 0, porPgto, porProd };
  },

  listarParcelas: () => run(sb.from('parcelas').select('*, venda:vendas(id, data, cliente, cliente_id)').order('vencimento').order('id')),
  parcelasDaVenda: ({ vendaId }) => run(sb.from('parcelas').select('*').eq('venda_id', vendaId).order('numero')),
  pagarParcela: ({ id, forma }) => run(sb.rpc('pagar_parcela', { p_id: id, p_forma: forma, p_data: diaLocal() }))
};

async function api(action, payload = {}) {
  try {
    return await ACTIONS[action](payload);
  } catch (e) {
    toast('Erro: ' + e.message, 4000, 'danger');
    throw e;
  }
}

// ── Helper barcode ────────────────────────────────
function gerarBarcode() {
  const base='789'+String(Date.now()).slice(-9);
  let s=0; for(let i=0;i<12;i++) s+=parseInt(base[i])*(i%2===0?1:3);
  return base+((10-(s%10))%10);
}

// ── ESTADO ───────────────────────────────────────
let cart = [];
let pgtoAtual = 'dinheiro';
let cfg = {};
let produtosCache = [];
let clientesMap = {};
let parcelasCache = [];
let chartVendas = null;
let chartPgto = null;

// ── INIT ─────────────────────────────────────────
window.onload = async () => {
  renderClock();
  if (SUPABASE_URL.includes('SEU-PROJETO')) toast('Configure SUPABASE_URL e SUPABASE_ANON_KEY no scripts.js', 8000, 'danger');
  cfg = await api('getConfig').catch(() => ({}));
  loadConfigUI();
  renderDashboard();
  const fd = document.getElementById('fin-data');
  if (fd) fd.value = diaLocal();
};

// ── NAVEGAÇÃO ────────────────────────────────────
const PAGE_META = {
  dashboard:    ['Dashboard', 'Visao geral da loja'],
  pdv:          ['Ponto de Venda', 'Registre novas vendas'],
  produtos:     ['Produtos', 'Catalogo e estoque'],
  clientes:     ['Clientes', 'Base de clientes'],
  funcionarios: ['Funcionarios', 'Equipe da loja'],
  financeiro:   ['Financeiro', 'Receitas, despesas e saldo'],
  parcelas:     ['Crediario', 'Parcelas a receber'],
  vendas:       ['Historico de Vendas', 'Todas as vendas'],
  relatorio:    ['Relatorios', 'Analise de desempenho'],
  config:       ['Configuracoes', 'Dados da loja']
};

const PAGE_ORDER = ['dashboard','pdv','produtos','clientes','funcionarios','financeiro','parcelas','vendas','relatorio','config'];

function nav(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('#sidebar nav a').forEach(a => a.classList.remove('active'));
  document.getElementById('sec-' + section).classList.add('active');
  const [title, sub] = PAGE_META[section] || [section, ''];
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-sub').textContent   = sub;
  const idx = PAGE_ORDER.indexOf(section);
  if (idx >= 0) document.querySelectorAll('#sidebar nav a')[idx].classList.add('active');
  if (section === 'dashboard')    renderDashboard();
  if (section === 'produtos')     carregarProdutos();
  if (section === 'clientes')     { carregarClientes(); carregarClientesPDV(); }
  if (section === 'funcionarios') carregarFuncionarios();
  if (section === 'financeiro')   { carregarFinanceiro(); carregarResumoFin(); }
  if (section === 'parcelas')     carregarParcelas();
  if (section === 'vendas')       carregarVendas();
  if (section === 'pdv')          { carregarProdutosPDV(); carregarClientesPDV(); }
  if (section === 'config')       api('getConfig').then(c => { cfg = c; loadConfigUI(); });
}

function toggleForm(id) {
  const el = document.getElementById(id);
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ── RELOGIO ──────────────────────────────────────
function renderClock() {
  setInterval(() => {
    const el = document.getElementById('clock');
    if (el) el.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }, 1000);
}

// ── TOAST ────────────────────────────────────────
function toast(msg, dur = 3500, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = type === 'danger' ? '#B91C1C' : type === 'success' ? '#065F46' : '#0A0800';
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(() => el.style.display = 'none', dur);
}

// ── FORMATADORES ─────────────────────────────────
function fmtMoney(v) {
  return 'R$ ' + parseFloat(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function maskCPF(el) {
  el.value = el.value.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function maskTel(el) {
  el.value = el.value.replace(/\D/g, '').slice(0, 11)
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

// ── DASHBOARD ────────────────────────────────────
async function renderDashboard() {
  const [vendas, prods, clis, fin, parcs] = await Promise.all([
    api('listarVendas', {}).catch(() => []),
    api('listarProdutos', { q: '' }).catch(() => []),
    api('listarClientes', { q: '' }).catch(() => []),
    api('resumoFinanceiro').catch(() => ({ receitas: 0, despesas: 0, saldo: 0 })),
    api('listarParcelas').catch(() => [])
  ]);

  const hoje       = diaLocal();
  const vHoje      = vendas.filter(v => diaLocal(v.data) === hoje);
  const totalHoje  = vHoje.reduce((s, v) => s + +v.total, 0);
  const totalGeral = vendas.reduce((s, v) => s + +v.total, 0);
  const semEstoque = prods.filter(p => p.estoque <= 0).length;
  const estBaixo   = prods.filter(p => p.estoque > 0 && p.estoque <= 5).length;
  const vencidas   = parcs.filter(p => !p.pago_em && p.vencimento < hoje);

  let alertsHTML = '';
  if (vencidas.length) alertsHTML += `<div class="alert-bar danger" style="cursor:pointer" onclick="nav('parcelas')"><span class="alert-text">${vencidas.length} parcela(s) vencida(s) no crediario - ${fmtMoney(vencidas.reduce((s, p) => s + +p.valor, 0))}</span></div>`;
  if (semEstoque > 0) alertsHTML += `<div class="alert-bar danger"><span class="alert-text">${semEstoque} produto(s) sem estoque!</span></div>`;
  if (estBaixo   > 0) alertsHTML += `<div class="alert-bar"><span class="alert-text">${estBaixo} produto(s) com estoque baixo (5 ou menos)</span></div>`;
  document.getElementById('dash-alerts').innerHTML = alertsHTML;

  document.getElementById('kpi-row').innerHTML = `
    <div class="kpi-card green">
      <div class="kpi-icon">&#128176;</div>
      <div class="kpi-val">${fmtMoney(totalHoje)}</div>
      <div class="kpi-label">Vendas Hoje</div>
      <div class="kpi-trend up">${vHoje.length} pedidos</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">&#128200;</div>
      <div class="kpi-val">${fmtMoney(totalGeral)}</div>
      <div class="kpi-label">Total Geral</div>
      <div class="kpi-trend up">${vendas.length} vendas</div>
    </div>
    <div class="kpi-card blue">
      <div class="kpi-icon">&#128101;</div>
      <div class="kpi-val">${clis.length}</div>
      <div class="kpi-label">Clientes</div>
    </div>
    <div class="kpi-card amber">
      <div class="kpi-icon">&#128230;</div>
      <div class="kpi-val">${prods.length}</div>
      <div class="kpi-label">Produtos</div>
      ${semEstoque > 0 ? `<div class="kpi-trend down">${semEstoque} sem estoque</div>` : ''}
    </div>
    <div class="kpi-card ${fin.saldo >= 0 ? 'green' : 'red'}">
      <div class="kpi-icon">&#128181;</div>
      <div class="kpi-val">${fmtMoney(fin.saldo)}</div>
      <div class="kpi-label">Saldo Caixa</div>
    </div>`;

  const porDia = {};
  vendas.forEach(v => { const k = diaLocal(v.data); porDia[k] = (porDia[k] || 0) + +v.total; });
  const labels7 = [], vals7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    labels7.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
    vals7.push(porDia[diaLocal(d)] || 0);
  }
  if (chartVendas) chartVendas.destroy();
  chartVendas = new Chart(document.getElementById('chart-vendas').getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels7,
      datasets: [{ label: 'Vendas', data: vals7, backgroundColor: 'rgba(201,168,76,0.2)', borderColor: '#C9A84C', borderWidth: 2, borderRadius: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { callback: v => 'R$' + v }, grid: { color: 'rgba(0,0,0,.05)' } },
        x: { grid: { display: false } }
      }
    }
  });

  const pgtoMap = {};
  vendas.forEach(v => { const k = v.forma || (v.pgto || '').split(' ')[0]; pgtoMap[k] = (pgtoMap[k] || 0) + +v.total; });
  if (chartPgto) chartPgto.destroy();
  if (Object.keys(pgtoMap).length) {
    chartPgto = new Chart(document.getElementById('chart-pgto').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(pgtoMap),
        datasets: [{ data: Object.values(pgtoMap), backgroundColor: ['#C9A84C','#8B6914','#10B981','#F59E0B','#3B82F6','#EF4444'], borderWidth: 2, borderColor: '#fff' }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10 } } } }
    });
  }

  const ultimas = vendas.slice(0, 8);
  document.getElementById('dashboard-table').innerHTML = ultimas.length
    ? `<table><thead><tr><th>Data</th><th>Cliente</th><th>Pagamento</th><th>Itens</th><th>Total</th></tr></thead><tbody>
       ${ultimas.map(v => `<tr>
         <td style="color:var(--muted);font-size:.82rem">${new Date(v.data).toLocaleString('pt-BR')}</td>
         <td><b>${esc(v.cliente || '-')}</b></td>
         <td><span class="badge badge-purple">${esc(v.forma)}</span></td>
         <td style="color:var(--muted)">${(v.itens || []).length} itens</td>
         <td><b style="color:var(--p1)">${fmtMoney(v.total)}</b></td>
       </tr>`).join('')}</tbody></table>`
    : '<div class="empty-state"><div class="es-icon">&#128203;</div><div class="es-text">Nenhuma venda registrada.</div></div>';
}

// ── PRODUTOS ─────────────────────────────────────
async function salvarProduto() {
  const nome  = document.getElementById('p-nome').value.trim();
  const preco = parseFloat(document.getElementById('p-preco').value);
  if (!nome || !preco) { toast('Preencha nome e preco!'); return; }
  await api('salvarProduto', {
    nome,
    categoria: document.getElementById('p-cat').value,
    tamanho:   document.getElementById('p-tam').value,
    cor:       document.getElementById('p-cor').value,
    custo:     document.getElementById('p-custo').value || 0,
    preco,
    estoque:   document.getElementById('p-estoque').value || 0,
    barcode:   document.getElementById('p-barcode').value
  });
  toast('Produto salvo!', 3000, 'success');
  ['p-nome','p-cor','p-custo','p-preco','p-estoque','p-barcode'].forEach(id => document.getElementById(id).value = '');
  carregarProdutos();
}

async function carregarProdutos() {
  const q     = (document.getElementById('search-prod') || {}).value || '';
  const prods = await api('listarProdutos', { q }).catch(() => []);
  produtosCache = prods;
  const el = document.getElementById('table-produtos');
  if (!el) return;
  el.innerHTML = prods.length
    ? `<table><thead><tr><th>Codigo</th><th>Nome</th><th>Cat.</th><th>Tam.</th><th>Cor</th><th>Custo</th><th>Preco</th><th>Margem</th><th>Estoque</th><th>Acoes</th></tr></thead><tbody>
       ${prods.map(p => {
         const margem     = p.custo > 0 ? ((p.preco - p.custo) / p.custo * 100).toFixed(1) + '%' : '-';
         const estoqClass = p.estoque > 5 ? 'badge-success' : p.estoque > 0 ? 'badge-warning' : 'badge-danger';
         return `<tr>
           <td><code style="font-size:.78rem;background:var(--bg);padding:2px 6px;border-radius:4px">${esc(p.barcode)}</code></td>
           <td><b>${esc(p.nome)}</b></td><td>${esc(p.categoria)}</td><td>${esc(p.tamanho)}</td><td>${esc(p.cor || '-')}</td>
           <td style="color:var(--muted)">${fmtMoney(p.custo)}</td>
           <td><b style="color:var(--p1)">${fmtMoney(p.preco)}</b></td>
           <td><span class="badge badge-info">${margem}</span></td>
           <td><span class="badge ${estoqClass}">${p.estoque} un.</span></td>
           <td style="white-space:nowrap">
             <button class="btn btn-sm btn-outline" onclick="showEtiquetaId(${p.id})">Etiqueta</button>
             <button class="btn btn-sm btn-ghost" onclick="deletarProduto(${p.id})">Excluir</button>
           </td>
         </tr>`;
       }).join('')}</tbody></table>`
    : '<div class="empty-state"><div class="es-icon">&#128230;</div><div class="es-text">Nenhum produto cadastrado.</div></div>';
}

async function deletarProduto(id) {
  if (!confirm('Remover produto?')) return;
  await api('deletarProduto', { id });
  toast('Produto removido.');
  carregarProdutos();
}

function imprimirEtiqueta() {
  const nome  = document.getElementById('p-nome').value.trim();
  const preco = document.getElementById('p-preco').value;
  const code  = document.getElementById('p-barcode').value || '7890000000000';
  if (!nome) { toast('Preencha o nome!'); return; }
  showEtiqueta({ nome, preco, barcode: code, tamanho: document.getElementById('p-tam').value, cor: document.getElementById('p-cor').value });
}

function showEtiquetaId(id) {
  const p = produtosCache.find(x => x.id === id);
  if (p) showEtiqueta(p);
}

function showEtiqueta(prod) {
  const preview = document.getElementById('etiqueta-preview');
  preview.innerHTML = `
    <div style="font-family:monospace;max-width:280px;margin:0 auto;background:#fff;padding:16px;border-radius:8px">
      <div style="font-size:.8rem;color:var(--muted);margin-bottom:2px">${esc(cfg.nome || 'Essencial Modas')}</div>
      <div style="font-size:1.05rem;font-weight:700;margin-bottom:2px">${esc(prod.nome)}</div>
      <div style="font-size:.85rem;color:var(--muted);margin-bottom:4px">${esc(prod.tamanho || '')}${prod.cor ? ' - ' + esc(prod.cor) : ''}</div>
      <div style="font-size:1.4rem;font-weight:800;color:var(--p1);margin-bottom:8px">${fmtMoney(prod.preco)}</div>
      <svg id="barcode-etq"></svg>
    </div>`;
  openModal('modal-etiqueta');
  setTimeout(() => {
    try { JsBarcode('#barcode-etq', prod.barcode, { format: 'CODE128', width: 2, height: 50, displayValue: true, fontSize: 12 }); } catch (e) {}
    document.getElementById('print-area').innerHTML = preview.innerHTML;
  }, 100);
}

// ── CLIENTES ─────────────────────────────────────
async function salvarCliente() {
  const nome = document.getElementById('c-nome').value.trim();
  if (!nome) { toast('Preencha o nome!'); return; }
  await api('salvarCliente', {
    nome,
    cpf:   document.getElementById('c-cpf').value,
    tel:   document.getElementById('c-tel').value,
    email: document.getElementById('c-email').value,
    nasc:  document.getElementById('c-nasc').value,
    end:   document.getElementById('c-end').value,
    obs:   document.getElementById('c-obs').value
  });
  toast('Cliente salvo!', 3000, 'success');
  ['c-nome','c-cpf','c-tel','c-email','c-nasc','c-end','c-obs'].forEach(id => document.getElementById(id).value = '');
  carregarClientes();
  carregarClientesPDV();
}

async function carregarClientes() {
  const q    = (document.getElementById('search-cli') || {}).value || '';
  const clis = await api('listarClientes', { q }).catch(() => []);
  const el   = document.getElementById('table-clientes');
  if (!el) return;
  el.innerHTML = clis.length
    ? `<table><thead><tr><th>Nome</th><th>CPF</th><th>Telefone</th><th>E-mail</th><th>Aniversario</th><th>Acoes</th></tr></thead><tbody>
       ${clis.map(c => `<tr>
         <td><b>${esc(c.nome)}</b></td><td>${esc(c.cpf || '-')}</td><td>${esc(c.tel || '-')}</td><td>${esc(c.email || '-')}</td>
         <td>${fmtDate(c.nasc)}</td>
         <td style="white-space:nowrap">
           ${c.tel ? `<button class="btn btn-sm btn-success" onclick="whatsappCliente(${c.id})">WhatsApp</button>` : ''}
           <button class="btn btn-sm btn-ghost" onclick="deletarCliente(${c.id})">Excluir</button>
         </td>
       </tr>`).join('')}</tbody></table>`
    : '<div class="empty-state"><div class="es-icon">&#128101;</div><div class="es-text">Nenhum cliente cadastrado.</div></div>';
  clis.forEach(c => clientesMap[c.id] = c);
}

async function carregarClientesMap() {
  const clis = await api('listarClientes', { q: '' }).catch(() => []);
  clientesMap = {};
  clis.forEach(c => clientesMap[c.id] = c);
  return clis;
}

async function carregarClientesPDV() {
  const sel  = document.getElementById('pdv-cliente');
  if (!sel) return;
  const clis = await carregarClientesMap();
  sel.innerHTML = '<option value="">-- Consumidor final --</option>' + clis.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
}

async function telCliente(id) {
  if (!id) return '';
  if (!clientesMap[id]) {
    const c = await run(sb.from('clientes').select('*').eq('id', id).maybeSingle()).catch(() => null);
    if (c) clientesMap[id] = c;
  }
  return (clientesMap[id] || {}).tel || '';
}

function whatsappCliente(id) {
  const c = clientesMap[id];
  if (c) whatsapp(c.tel, 'Ola ' + c.nome + '!');
}

async function deletarCliente(id) {
  if (!confirm('Remover cliente?')) return;
  await api('deletarCliente', { id });
  toast('Cliente removido.');
  carregarClientes();
}

// ── FUNCIONARIOS ─────────────────────────────────
async function salvarFuncionario() {
  const nome = document.getElementById('f-nome').value.trim();
  if (!nome) { toast('Preencha o nome!'); return; }
  await api('salvarFuncionario', {
    nome,
    cpf:      document.getElementById('f-cpf').value,
    cargo:    document.getElementById('f-cargo').value,
    tel:      document.getElementById('f-tel').value,
    salario:  document.getElementById('f-salario').value || 0,
    admissao: document.getElementById('f-admissao').value,
    comissao: document.getElementById('f-comissao').value || 0,
    email:    document.getElementById('f-email').value
  });
  toast('Funcionario salvo!', 3000, 'success');
  ['f-nome','f-cpf','f-tel','f-salario','f-admissao','f-comissao','f-email'].forEach(id => document.getElementById(id).value = '');
  carregarFuncionarios();
}

async function carregarFuncionarios() {
  const q     = (document.getElementById('search-func') || {}).value || '';
  const funcs = await api('listarFuncionarios', { q }).catch(() => []);
  const el    = document.getElementById('table-funcionarios');
  if (!el) return;
  el.innerHTML = funcs.length
    ? `<table><thead><tr><th>Nome</th><th>Cargo</th><th>Salario</th><th>Comissao</th><th>Admissao</th><th>Acoes</th></tr></thead><tbody>
       ${funcs.map(f => `<tr>
         <td><b>${esc(f.nome)}</b><br><span style="font-size:.78rem;color:var(--muted)">${esc(f.email || '')}</span></td>
         <td><span class="badge badge-purple">${esc(f.cargo)}</span></td>
         <td>${fmtMoney(f.salario)}</td>
         <td><span class="badge badge-info">${f.comissao}%</span></td>
         <td>${fmtDate(f.admissao)}</td>
         <td><button class="btn btn-sm btn-ghost" onclick="deletarFuncionario(${f.id})">Excluir</button></td>
       </tr>`).join('')}</tbody></table>`
    : '<div class="empty-state"><div class="es-icon">&#128100;</div><div class="es-text">Nenhum funcionario cadastrado.</div></div>';
}

async function deletarFuncionario(id) {
  if (!confirm('Remover funcionario?')) return;
  await api('deletarFuncionario', { id });
  toast('Removido.');
  carregarFuncionarios();
}

// ── FINANCEIRO ───────────────────────────────────
async function salvarFinanceiro() {
  const valor = parseFloat(document.getElementById('fin-valor').value);
  const desc  = document.getElementById('fin-desc').value.trim();
  if (!valor || !desc) { toast('Preencha valor e descricao!'); return; }
  await api('salvarFinanceiro', {
    tipo:      document.getElementById('fin-tipo').value,
    categoria: document.getElementById('fin-cat').value,
    descricao: desc,
    valor,
    data: document.getElementById('fin-data').value
  });
  toast('Lancamento salvo!', 3000, 'success');
  ['fin-valor','fin-desc'].forEach(id => document.getElementById(id).value = '');
  carregarFinanceiro();
  carregarResumoFin();
}

async function carregarResumoFin() {
  const r = await api('resumoFinanceiro').catch(() => null);
  if (!r) return;
  document.getElementById('fin-receitas').textContent = fmtMoney(r.receitas);
  document.getElementById('fin-despesas').textContent = fmtMoney(Math.abs(r.despesas));
  const sEl = document.getElementById('fin-saldo');
  sEl.textContent = fmtMoney(r.saldo);
  sEl.style.color = r.saldo >= 0 ? '#8B6914' : '#B91C1C';
}

async function carregarFinanceiro() {
  const q    = (document.getElementById('search-fin') || {}).value || '';
  const tipo = (document.getElementById('filter-fin-tipo') || {}).value || '';
  const rows = await api('listarFinanceiro', { q, tipo }).catch(() => []);
  const el   = document.getElementById('table-financeiro');
  if (!el) return;
  el.innerHTML = rows.length
    ? `<table><thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descricao</th><th>Valor</th><th>Acoes</th></tr></thead><tbody>
       ${rows.map(f => {
         const isRec = f.tipo === 'Receita';
         return `<tr>
           <td style="color:var(--muted);font-size:.82rem">${fmtDate(f.data)}</td>
           <td><span class="badge ${isRec ? 'badge-success' : 'badge-danger'}">${f.tipo}</span></td>
           <td><span class="badge badge-purple">${esc(f.categoria)}</span></td>
           <td>${esc(f.descricao)}</td>
           <td><b style="color:${isRec ? 'var(--success)' : 'var(--danger)'}">${isRec ? '+' : '-'} ${fmtMoney(Math.abs(f.valor))}</b></td>
           <td><button class="btn btn-sm btn-ghost" onclick="deletarFinanceiro(${f.id})">Excluir</button></td>
         </tr>`;
       }).join('')}</tbody></table>`
    : '<div class="empty-state"><div class="es-icon">&#128176;</div><div class="es-text">Nenhum lancamento encontrado.</div></div>';
}

async function deletarFinanceiro(id) {
  if (!confirm('Remover lancamento?')) return;
  await api('deletarFinanceiro', { id });
  toast('Removido.');
  carregarFinanceiro();
  carregarResumoFin();
}

// ── PDV ──────────────────────────────────────────
async function carregarProdutosPDV() {
  produtosCache = await api('listarProdutos', { q: '' }).catch(() => []);
}

function pdvSearch() {
  const q   = document.getElementById('pdv-search').value.toLowerCase();
  const res = document.getElementById('pdv-results');
  if (!q) { res.innerHTML = ''; return; }
  const prods = produtosCache.filter(p => p.nome.toLowerCase().includes(q) || String(p.barcode).includes(q)).slice(0, 6);
  res.innerHTML = prods.length
    ? prods.map(p => `
        <div class="prod-result-item" onclick="addToCart(${p.id})">
          <div>
            <b>${esc(p.nome)}</b>
            <div style="font-size:.78rem;color:var(--muted)">Tam: ${esc(p.tamanho)} - ${esc(p.barcode)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <b style="color:var(--p1)">${fmtMoney(p.preco)}</b>
            <span class="badge ${p.estoque > 0 ? 'badge-success' : 'badge-danger'}">${p.estoque} un.</span>
          </div>
        </div>`).join('')
    : '<div style="padding:12px;color:var(--muted);font-size:.88rem">Nenhum produto encontrado.</div>';
}

function pdvAddByCode() {
  const q    = document.getElementById('pdv-search').value.trim();
  const prod = produtosCache.find(p => p.barcode === q);
  if (prod) addToCart(prod.id); else pdvSearch();
}

function addToCart(prodId) {
  const prod = produtosCache.find(p => String(p.id) === String(prodId));
  if (!prod) return;
  if (prod.estoque <= 0) { toast('Produto sem estoque!'); return; }
  const qty = parseInt(document.getElementById('pdv-qty').value) || 1;
  const ex  = cart.find(i => String(i.id) === String(prodId));
  if (ex) ex.qty += qty; else cart.push({ ...prod, qty });
  document.getElementById('pdv-search').value      = '';
  document.getElementById('pdv-results').innerHTML = '';
  document.getElementById('pdv-qty').value         = 1;
  renderCart();
  toast(prod.nome + ' adicionado', 2000, 'success');
}

function removeFromCart(i) { cart.splice(i, 1); renderCart(); }

function renderCart() {
  const el = document.getElementById('cart-list');
  el.innerHTML = cart.length
    ? cart.map((item, i) => `
        <div class="cart-item">
          <div>
            <div class="cart-item-name">${esc(item.nome)}</div>
            <div class="cart-item-sub">${fmtMoney(item.preco)} x ${item.qty} un.</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <b style="color:var(--p1)">${fmtMoney(item.preco * item.qty)}</b>
            <button class="btn btn-ghost btn-sm" onclick="removeFromCart(${i})" style="color:var(--danger)">X</button>
          </div>
        </div>`).join('')
    : '<div class="empty-state" style="padding:24px"><div class="es-icon" style="font-size:1.8rem">&#128722;</div><div class="es-text">Carrinho vazio</div></div>';
  renderTotal();
}

function renderTotal() {
  const sub  = cart.reduce((s, i) => s + i.preco * i.qty, 0);
  const desc = parseFloat(document.getElementById('desc-val').value) || 0;
  const liquido = Math.max(0, sub - desc);
  document.getElementById('sub-val').textContent    = fmtMoney(sub);
  document.getElementById('cart-total').textContent = fmtMoney(liquido);
  calcJuros();
  calcBoleto();
}

function selectPgto(el, tipo) {
  document.querySelectorAll('.pgto-btn').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  pgtoAtual = tipo;
  document.getElementById('juros-box').style.display  = tipo === 'credito' ? 'block' : 'none';
  document.getElementById('boleto-box').style.display = tipo === 'boleto'  ? 'block' : 'none';
  const venc = document.getElementById('boleto-venc');
  if (tipo === 'boleto' && !venc.value) venc.value = addDias(30);
  renderTotal();
}

function getTotal() {
  const sub = cart.reduce((s, i) => s + i.preco * i.qty, 0);
  return Math.max(0, sub - (parseFloat(document.getElementById('desc-val').value) || 0));
}

function calcJuros() {
  if (pgtoAtual !== 'credito') return;
  const parc   = parseInt(document.getElementById('parcelas').value);
  const jMap   = { 1: 0, 2: +(cfg.j2||0), 3: +(cfg.j3||2), 6: +(cfg.j6||4), 12: +(cfg.j12||8) };
  const pct    = jMap[parc] || 0;
  const totalJ = getTotal() * (1 + pct / 100);
  document.getElementById('juros-result').innerHTML = pct > 0
    ? `<span style="color:var(--danger)">${parc}x de ${fmtMoney(totalJ / parc)} - ${pct}% juros - Total: ${fmtMoney(totalJ)}</span>`
    : `<span style="color:var(--success)">${parc}x de ${fmtMoney(totalJ / parc)} sem juros</span>`;
  document.getElementById('cart-total').textContent = fmtMoney(totalJ);
}

function calcBoleto() {
  if (pgtoAtual !== 'boleto') return;
  const pct    = parseFloat(document.getElementById('boleto-juros').value) || 0;
  const parc   = parseInt(document.getElementById('boleto-parc').value) || 1;
  const totalJ = getTotal() * (1 + pct / 100);
  document.getElementById('boleto-result').innerHTML =
    `<span style="color:${pct > 0 ? 'var(--danger)' : 'var(--muted)'}">${parc}x de ${fmtMoney(totalJ / parc)} - Total${pct > 0 ? ' com juros' : ''}: ${fmtMoney(totalJ)}</span>`;
  document.getElementById('cart-total').textContent = fmtMoney(totalJ);
}

function clearCart() { cart = []; renderCart(); }

async function finalizarVenda() {
  if (!cart.length) { toast('Carrinho vazio!'); return; }
  const clienteId = document.getElementById('pdv-cliente').value;
  const cliente   = clienteId ? (clientesMap[clienteId] || {}).nome || '' : '';
  const sub  = cart.reduce((s, i) => s + i.preco * i.qty, 0);
  const desc = parseFloat(document.getElementById('desc-val').value) || 0;
  let total  = Math.max(0, sub - desc);
  let jurosInfo = '';
  let parcelas = 1, vencimento = null;

  if (pgtoAtual === 'credito') {
    const parc = parseInt(document.getElementById('parcelas').value);
    const jMap = { 1: 0, 2: +(cfg.j2||0), 3: +(cfg.j3||2), 6: +(cfg.j6||4), 12: +(cfg.j12||8) };
    const pct  = jMap[parc] || 0;
    total = total * (1 + pct / 100);
    jurosInfo = parc > 1 ? ` (${parc}x - ${pct}% juros)` : ' (a vista)';
  }
  if (pgtoAtual === 'boleto') {
    if (!clienteId) { toast('Selecione o cliente para vender no boleto!'); return; }
    const pct = parseFloat(document.getElementById('boleto-juros').value) || 0;
    parcelas   = parseInt(document.getElementById('boleto-parc').value) || 1;
    vencimento = document.getElementById('boleto-venc').value || addDias(30);
    total = total * (1 + pct / 100);
    jurosInfo = ` (${parcelas}x${pct > 0 ? ` - +${pct}% juros` : ''})`;
  }

  const venda = {
    cliente_id: clienteId || null,
    cliente,
    forma:    pgtoAtual,
    pgto:     pgtoAtual + jurosInfo,
    itens:    cart.map(i => ({ id: i.id, nome: i.nome, barcode: i.barcode, tamanho: i.tamanho, cor: i.cor, preco: +i.preco, qty: i.qty })),
    subtotal: sub,
    desconto: desc,
    total:    Math.round(total * 100) / 100,
    parcelas,
    vencimento,
    hoje:     diaLocal()
  };

  const r = await api('registrarVenda', venda).catch(() => null);
  if (!r) return;

  cart.forEach(item => {
    const p = produtosCache.find(x => String(x.id) === String(item.id));
    if (p) p.estoque = Math.max(0, p.estoque - item.qty);
  });

  const parcs = r.forma === 'boleto' ? await api('parcelasDaVenda', { vendaId: r.id }).catch(() => []) : [];
  showModalVenda({ ...r, parcelas: parcs });
  clearCart();
  document.getElementById('desc-val').value = 0;
}

// ── MODAL VENDA ───────────────────────────────────
function showModalVenda(v) {
  const loja = cfg.nome || 'Essencial Modas';
  const parcs = v.parcelas || [];
  document.getElementById('modal-venda-title').textContent = 'Venda Finalizada!';
  document.getElementById('modal-venda-body').innerHTML = `
    <div class="nota" id="nota-content">
      <div class="nota-header">
        <b style="font-size:1.05rem">${esc(loja)}</b><br>
        <span style="font-size:.78rem;color:var(--muted)">${esc(cfg.cnpj || '')} ${cfg.cidade ? '- ' + esc(cfg.cidade) : ''}</span><br>
        <b style="margin-top:6px;display:block">RECIBO DE VENDA</b>
        <span style="color:var(--muted);font-size:.78rem">#${v.id} - ${new Date(v.data).toLocaleString('pt-BR')}</span>
      </div>
      <div style="margin-bottom:8px"><b>Cliente:</b> ${esc(v.cliente || 'Consumidor final')}</div>
      ${v.itens.map(i => `<div class="nota-row"><span>${esc(i.nome)} (${i.qty}x)</span><span>${fmtMoney(i.preco * i.qty)}</span></div>`).join('')}
      <div class="nota-total">
        <div class="nota-row"><span>Subtotal</span><span>${fmtMoney(v.subtotal)}</span></div>
        ${v.desconto > 0 ? `<div class="nota-row" style="color:var(--danger)"><span>Desconto</span><span>- ${fmtMoney(v.desconto)}</span></div>` : ''}
        <div class="nota-row" style="font-size:1.1rem;font-weight:800;color:var(--p1)"><span>TOTAL</span><span>${fmtMoney(v.total)}</span></div>
        <div style="margin-top:6px;font-size:.88rem"><b>Pagamento:</b> ${esc(v.pgto)}</div>
      </div>
      ${parcs.length ? `<div class="nota-total">
        ${parcs.map(p => `<div class="nota-row"><span>Parcela ${p.numero}/${p.total_parcelas} - venc. ${fmtDate(p.vencimento)}</span><span>${fmtMoney(p.valor)}</span></div>`).join('')}
      </div>` : ''}
      <div class="nota-footer">Obrigado pela preferencia!</div>
    </div>`;

  // Salva venda atual globalmente para uso no botão WhatsApp
  window._vendaAtual = v;

  const btnWhats = v.cliente_id
    ? `<button class="btn btn-success" onclick="enviarWhatsappRecibo()">&#128262; WhatsApp</button>`
    : '';

  document.getElementById('modal-venda-actions').innerHTML = `
    <button class="btn btn-primary" onclick="imprimirNota()">Imprimir Recibo</button>
    ${btnWhats}
    <button class="btn btn-outline" onclick="closeModal('modal-venda')">Fechar</button>`;

  openModal('modal-venda');
}

// ── WHATSAPP RECIBO ───────────────────────────────
async function enviarWhatsappRecibo() {
  const v = window._vendaAtual;
  if (!v) return;
  const loja  = cfg.nome || 'Essencial Modas';
  const itens = (v.itens || []).map(i => `  • ${i.nome} x${i.qty} = ${fmtMoney(i.preco * i.qty)}`).join('\n');
  const desc  = v.desconto > 0 ? `\nDesconto: - ${fmtMoney(v.desconto)}` : '';
  const parcs = (v.parcelas || []).length
    ? '\n\n*Parcelas:*\n' + v.parcelas.map(p => `  ${p.numero}/${p.total_parcelas} - venc. ${fmtDate(p.vencimento)} - ${fmtMoney(p.valor)}`).join('\n')
    : '';
  const msg   = `*${loja}*\n\n*RECIBO DE VENDA #${v.id}*\n${new Date(v.data).toLocaleString('pt-BR')}\n\n${itens}${desc}\n\n*TOTAL: ${fmtMoney(v.total)}*\nPagamento: ${v.pgto}${parcs}\n\nObrigado pela preferencia!`;
  enviarWhatsapp(await telCliente(v.cliente_id), msg);
}

function imprimirNota() {
  document.getElementById('print-area').innerHTML = document.getElementById('nota-content').outerHTML;
  window.print();
}

// ── CREDIARIO (PARCELAS) ─────────────────────────
async function carregarParcelas() {
  const [rows] = await Promise.all([api('listarParcelas').catch(() => []), carregarClientesMap()]);
  parcelasCache = rows;
  renderParcelas();
}

function statusParcela(p) {
  if (p.pago_em) return 'paga';
  return p.vencimento < diaLocal() ? 'vencida' : 'aberta';
}

function renderParcelas() {
  const busca  = ((document.getElementById('search-parc') || {}).value || '').toLowerCase().trim();
  const filtro = (document.getElementById('filter-parc-status') || {}).value || '';
  const mes    = diaLocal().slice(0, 7);

  const soma = arr => arr.reduce((s, p) => s + +p.valor, 0);
  document.getElementById('parc-aberto').textContent   = fmtMoney(soma(parcelasCache.filter(p => !p.pago_em)));
  document.getElementById('parc-vencido').textContent  = fmtMoney(soma(parcelasCache.filter(p => statusParcela(p) === 'vencida')));
  document.getElementById('parc-recebido').textContent = fmtMoney(soma(parcelasCache.filter(p => p.pago_em && diaLocal(p.pago_em).startsWith(mes))));

  const rows = parcelasCache.filter(p => {
    const st = statusParcela(p);
    if (filtro === 'abertas' && st === 'paga') return false;
    if (filtro && filtro !== 'abertas' && st !== filtro) return false;
    if (busca) {
      const alvo = ((p.venda || {}).cliente || '').toLowerCase() + ' #' + p.venda_id;
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });

  const badge = { paga: 'badge-success', vencida: 'badge-danger', aberta: 'badge-warning' };
  const label = { paga: 'Paga', vencida: 'Vencida', aberta: 'Em aberto' };
  document.getElementById('table-parcelas').innerHTML = rows.length
    ? `<table><thead><tr><th>Vencimento</th><th>Cliente</th><th>Venda</th><th>Parcela</th><th>Valor</th><th>Situacao</th><th>Acoes</th></tr></thead><tbody>
       ${rows.map(p => {
         const st = statusParcela(p);
         return `<tr>
           <td>${fmtDate(p.vencimento)}</td>
           <td><b>${esc((p.venda || {}).cliente || '-')}</b></td>
           <td style="color:var(--muted)">#${p.venda_id}</td>
           <td>${p.numero}/${p.total_parcelas}</td>
           <td><b style="color:var(--p1)">${fmtMoney(p.valor)}</b></td>
           <td><span class="badge ${badge[st]}">${label[st]}</span>${p.pago_em ? `<div style="font-size:.74rem;color:var(--muted);margin-top:2px">${fmtDate(diaLocal(p.pago_em))} - ${esc(p.forma_pgto || '')}</div>` : ''}</td>
           <td style="white-space:nowrap">
             ${p.pago_em ? '' : `<button class="btn btn-sm btn-success" onclick="receberParcela(${p.id})">Receber</button>`}
             <button class="btn btn-sm btn-outline" onclick="abrirConferencia(${p.venda_id}, ${p.id})">Conferencia</button>
           </td>
         </tr>`;
       }).join('')}</tbody></table>`
    : '<div class="empty-state"><div class="es-icon">&#128197;</div><div class="es-text">Nenhuma parcela encontrada.</div></div>';
}

function receberParcela(id) {
  const p = parcelasCache.find(x => x.id === id);
  if (!p) return;
  document.getElementById('modal-venda-title').textContent = 'Receber Parcela';
  document.getElementById('modal-venda-body').innerHTML = `
    <div class="total-box" style="margin-bottom:16px">
      <div class="total-row"><span style="color:var(--muted)">Cliente</span><b>${esc((p.venda || {}).cliente || '-')}</b></div>
      <div class="total-row"><span style="color:var(--muted)">Venda</span><span>#${p.venda_id}</span></div>
      <div class="total-row"><span style="color:var(--muted)">Parcela</span><span>${p.numero}/${p.total_parcelas} - venc. ${fmtDate(p.vencimento)}</span></div>
      <div class="total-row grand"><span>VALOR</span><span>${fmtMoney(p.valor)}</span></div>
    </div>
    <div class="form-group">
      <label>Forma de recebimento</label>
      <select id="rec-forma">
        <option value="dinheiro">Dinheiro</option><option value="pix">Pix</option>
        <option value="debito">Debito</option><option value="credito">Credito</option>
      </select>
    </div>`;
  document.getElementById('modal-venda-actions').innerHTML = `
    <button class="btn btn-success" id="btn-confirma-rec" onclick="confirmarRecebimento(${p.id}, ${p.venda_id})">Confirmar Recebimento</button>
    <button class="btn btn-outline" onclick="closeModal('modal-venda')">Cancelar</button>`;
  openModal('modal-venda');
}

async function confirmarRecebimento(id, vendaId) {
  const btn = document.getElementById('btn-confirma-rec');
  btn.disabled = true;
  const forma = document.getElementById('rec-forma').value;
  const ok = await api('pagarParcela', { id, forma }).catch(() => null);
  if (!ok) { btn.disabled = false; return; }
  closeModal('modal-venda');
  toast('Parcela recebida!', 3000, 'success');
  await abrirConferencia(vendaId, id);
  carregarParcelas();
}

// ── RELATORIO DE CONFERENCIA ─────────────────────
async function abrirConferencia(vendaId, parcelaId = null) {
  const [venda, parcelas] = await Promise.all([
    api('getVenda', { id: vendaId }),
    api('parcelasDaVenda', { vendaId })
  ]).catch(() => [null, null]);
  if (!venda) return;
  window._conf = { venda, parcelas, parcelaId };
  document.getElementById('conf-body').innerHTML = htmlConferencia(window._conf);
  openModal('modal-conf');
}

function resumoConferencia({ venda, parcelas, parcelaId }) {
  const atual = parcelas.find(p => p.id === parcelaId);
  const pagas = parcelas.filter(p => p.pago_em);
  return {
    atual,
    comprovante: !!(atual && atual.pago_em),
    pecas:     (venda.itens || []).reduce((s, i) => s + i.qty, 0),
    pago:      pagas.reduce((s, p) => s + +p.valor, 0),
    saldo:     parcelas.filter(p => !p.pago_em).reduce((s, p) => s + +p.valor, 0),
    restantes: parcelas.length - pagas.length
  };
}

function situacaoParcela(p) {
  if (p.pago_em) return `Paga em ${fmtDate(diaLocal(p.pago_em))}${p.forma_pgto ? ' (' + p.forma_pgto + ')' : ''}`;
  return statusParcela(p) === 'vencida' ? 'VENCIDA' : 'Em aberto';
}

function htmlConferencia(conf) {
  const { venda: v, parcelas } = conf;
  const r = resumoConferencia(conf);
  const loja = cfg.nome || 'Essencial Modas';
  return `
  <div class="conf-report" id="conf-content">
    <div class="conf-head">
      <div>
        <div class="conf-loja">${esc(loja)}</div>
        <div class="conf-sub">${esc(cfg.cnpj || '')}${cfg.cidade ? ' - ' + esc(cfg.cidade) : ''}</div>
        <div class="conf-sub">${esc(cfg.tel || '')}</div>
      </div>
      <div style="text-align:right">
        <div class="conf-title">CONFERENCIA DE PRODUTOS</div>
        <div class="conf-sub">${r.comprovante ? `Comprovante de pagamento - Parcela ${r.atual.numero}/${r.atual.total_parcelas}` : 'Posicao do crediario'}</div>
        <div class="conf-sub">Emitido em ${new Date().toLocaleString('pt-BR')}</div>
      </div>
    </div>

    <div class="conf-info">
      <div><b>Cliente:</b> ${esc(v.cliente || '-')}</div>
      <div><b>Venda:</b> #${v.id}</div>
      <div><b>Data da compra:</b> ${new Date(v.data).toLocaleString('pt-BR')}</div>
      <div><b>Pagamento:</b> ${esc(v.pgto || v.forma)}</div>
    </div>

    <h4>Produtos da compra</h4>
    <table>
      <thead><tr><th style="width:28px">Ok</th><th>Codigo</th><th>Produto</th><th>Tam / Cor</th><th style="text-align:center">Qtd</th><th style="text-align:right">Unit.</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>
        ${(v.itens || []).map(i => `<tr>
          <td><span class="conf-check"></span></td>
          <td style="font-size:.76rem">${esc(i.barcode || '-')}</td>
          <td class="conf-prod"><b>${esc(i.nome)}</b></td>
          <td class="conf-prod">${esc([i.tamanho, i.cor].filter(Boolean).join(' / ') || '-')}</td>
          <td style="text-align:center">${i.qty}</td>
          <td style="text-align:right">${fmtMoney(i.preco)}</td>
          <td style="text-align:right">${fmtMoney(i.preco * i.qty)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr><td colspan="4">Total de pecas</td><td style="text-align:center">${r.pecas}</td><td style="text-align:right">Subtotal</td><td style="text-align:right">${fmtMoney(v.subtotal)}</td></tr>
        ${v.desconto > 0 ? `<tr><td colspan="6" style="text-align:right">Desconto</td><td style="text-align:right">- ${fmtMoney(v.desconto)}</td></tr>` : ''}
        <tr><td colspan="6" style="text-align:right">Total da compra</td><td style="text-align:right">${fmtMoney(v.total)}</td></tr>
      </tfoot>
    </table>

    ${parcelas.length ? `
    <h4>Parcelas</h4>
    <table>
      <thead><tr><th>Parcela</th><th>Vencimento</th><th style="text-align:right">Valor</th><th>Situacao</th></tr></thead>
      <tbody>
        ${parcelas.map(p => `<tr class="${p.id === conf.parcelaId ? 'conf-atual' : ''}">
          <td>${p.numero}/${p.total_parcelas}${p.id === conf.parcelaId && p.pago_em ? ' - paga agora' : ''}</td>
          <td>${fmtDate(p.vencimento)}</td>
          <td style="text-align:right">${fmtMoney(p.valor)}</td>
          <td>${situacaoParcela(p)}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <div class="conf-resumo">
      <div>${r.comprovante ? 'Valor pago agora' : 'Parcelas pagas'}<b>${r.comprovante ? fmtMoney(r.atual.valor) : (parcelas.length - r.restantes) + '/' + parcelas.length}</b></div>
      <div>Total pago<b>${fmtMoney(r.pago)}</b></div>
      <div>Saldo devedor<b>${fmtMoney(r.saldo)}</b></div>
      <div>Parcelas restantes<b>${r.restantes ? r.restantes : 'QUITADO'}</b></div>
    </div>` : ''}

    <div class="conf-assin">
      <div>Conferido por (loja)</div>
      <div>Cliente</div>
    </div>
  </div>`;
}

function imprimirConferencia() {
  document.getElementById('print-area').innerHTML = document.getElementById('conf-content').outerHTML;
  window.print();
}

function textoConferencia(conf) {
  const { venda: v, parcelas } = conf;
  const r = resumoConferencia(conf);
  const linhas = [
    `*${cfg.nome || 'Essencial Modas'}*`,
    '*CONFERENCIA DE PRODUTOS*',
    r.comprovante ? `Comprovante de pagamento - Parcela ${r.atual.numero}/${r.atual.total_parcelas}` : 'Posicao do crediario',
    '',
    `Cliente: ${v.cliente || '-'}`,
    `Venda #${v.id} - ${new Date(v.data).toLocaleDateString('pt-BR')}`,
    '',
    '*Produtos:*',
    ...(v.itens || []).map((i, n) => {
      const det = [i.tamanho, i.cor].filter(Boolean).join(' / ');
      return `${n + 1}. ${i.nome}${det ? ' (' + det + ')' : ''} x${i.qty} = ${fmtMoney(i.preco * i.qty)}`;
    }),
    `Total de pecas: ${r.pecas}`,
    `Total da compra: ${fmtMoney(v.total)}`
  ];
  if (parcelas.length) {
    linhas.push('', '*Parcelas:*', ...parcelas.map(p => {
      const icone = p.pago_em ? '✅' : statusParcela(p) === 'vencida' ? '⚠️' : '⏳';
      const agora = p.id === conf.parcelaId && p.pago_em ? ' *(paga agora)*' : '';
      return `${icone} ${p.numero}/${p.total_parcelas} - venc. ${fmtDate(p.vencimento)} - ${fmtMoney(p.valor)} - ${situacaoParcela(p)}${agora}`;
    }));
    linhas.push('');
    if (r.comprovante) linhas.push(`*Valor pago: ${fmtMoney(r.atual.valor)}*`);
    linhas.push(`Total pago: ${fmtMoney(r.pago)}`, r.restantes ? `Saldo devedor: ${fmtMoney(r.saldo)} (${r.restantes} parcela(s))` : '*Compra QUITADA!*');
  }
  linhas.push('', 'Por favor, confira os produtos acima. Obrigado pela preferencia!');
  return linhas.join('\n');
}

async function enviarWhatsappConferencia() {
  const conf = window._conf;
  if (!conf) return;
  enviarWhatsapp(await telCliente(conf.venda.cliente_id), textoConferencia(conf));
}

// ── HISTORICO ────────────────────────────────────
async function carregarVendas() {
  const q    = (document.getElementById('search-venda') || {}).value || '';
  const data = (document.getElementById('filter-data')  || {}).value || '';
  const vendas = await api('listarVendas', { q, data }).catch(() => []);
  const el = document.getElementById('table-vendas');
  if (!el) return;
  el.innerHTML = vendas.length
    ? `<table><thead><tr><th>Data</th><th>Cliente</th><th>Itens</th><th>Pagamento</th><th>Subtotal</th><th>Desconto</th><th>Total</th><th></th></tr></thead><tbody>
       ${vendas.map(v => `<tr>
         <td style="color:var(--muted);font-size:.82rem">${new Date(v.data).toLocaleString('pt-BR')}</td>
         <td><b>${esc(v.cliente || '-')}</b></td>
         <td style="color:var(--muted)">${esc((v.itens || []).map(i => i.nome + ' x' + i.qty).join(', '))}</td>
         <td><span class="badge badge-purple">${esc(v.pgto)}</span></td>
         <td style="color:var(--muted)">${fmtMoney(v.subtotal)}</td>
         <td style="color:var(--danger)">${v.desconto > 0 ? '- ' + fmtMoney(v.desconto) : '-'}</td>
         <td><b style="color:var(--p1)">${fmtMoney(v.total)}</b></td>
         <td><button class="btn btn-sm btn-outline" onclick="abrirConferencia(${v.id})">Conferencia</button></td>
       </tr>`).join('')}</tbody></table>`
    : '<div class="empty-state"><div class="es-icon">&#128203;</div><div class="es-text">Nenhuma venda encontrada.</div></div>';
}

// ── RELATORIO ────────────────────────────────────
async function gerarRelatorio() {
  const rel = await api('relatorio', {
    ini:  document.getElementById('rel-ini').value,
    fim:  document.getElementById('rel-fim').value,
    pgto: document.getElementById('rel-pgto').value
  }).catch(() => null);
  if (!rel) { toast('Erro ao gerar relatorio!'); return; }

  document.getElementById('rel-result').innerHTML = `
    <div class="kpi-grid" style="margin-bottom:20px">
      <div class="kpi-card green"><div class="kpi-icon">&#128176;</div><div class="kpi-val">${fmtMoney(rel.total)}</div><div class="kpi-label">Total Vendas</div></div>
      <div class="kpi-card"><div class="kpi-icon">&#128203;</div><div class="kpi-val">${rel.qtdVendas}</div><div class="kpi-label">Num. Vendas</div></div>
      <div class="kpi-card amber"><div class="kpi-icon">&#128230;</div><div class="kpi-val">${rel.qtdItens}</div><div class="kpi-label">Pecas Vendidas</div></div>
      <div class="kpi-card blue"><div class="kpi-icon">&#127919;</div><div class="kpi-val">${fmtMoney(rel.ticketMedio)}</div><div class="kpi-label">Ticket Medio</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card">
        <div class="card-title"><div class="ct-icon">&#128179;</div> Por Pagamento</div>
        <table><thead><tr><th>Tipo</th><th>Total</th><th>%</th></tr></thead><tbody>
        ${Object.entries(rel.porPgto).map(([k, v]) => `<tr>
          <td><span class="badge badge-purple">${esc(k)}</span></td>
          <td><b>${fmtMoney(v)}</b></td>
          <td>${rel.total ? ((v / rel.total) * 100).toFixed(1) : 0}%</td>
        </tr>`).join('')}</tbody></table>
      </div>
      <div class="card">
        <div class="card-title"><div class="ct-icon">&#127942;</div> Mais Vendidos</div>
        <table><thead><tr><th>Produto</th><th>Qtd</th><th>Total</th></tr></thead><tbody>
        ${Object.entries(rel.porProd).sort((a, b) => b[1].qty - a[1].qty).slice(0, 8).map(([k, v]) => `<tr>
          <td><b>${esc(k)}</b></td>
          <td><span class="badge badge-info">${v.qty} un.</span></td>
          <td><b style="color:var(--p1)">${fmtMoney(v.total)}</b></td>
        </tr>`).join('')}</tbody></table>
      </div>
    </div>`;
}

// ── CONFIG ───────────────────────────────────────
function loadConfigUI() {
  ['nome','cnpj','tel','cidade','end'].forEach(k => {
    const el = document.getElementById('cfg-' + k);
    if (el) el.value = cfg[k] || '';
  });
  ['j2','j3','j6','j12'].forEach(k => {
    const el = document.getElementById(k);
    if (el) el.value = cfg[k] !== undefined && cfg[k] !== null ? cfg[k] : (k === 'j2' ? 0 : k === 'j3' ? 2 : k === 'j6' ? 4 : 8);
  });
}

async function salvarConfigUI() {
  const c = {};
  ['nome','cnpj','tel','cidade','end'].forEach(k => c[k] = (document.getElementById('cfg-' + k) || {}).value || '');
  ['j2','j3','j6','j12'].forEach(k => c[k] = parseFloat((document.getElementById(k) || {}).value) || 0);
  await api('salvarConfig', c);
  cfg = c;
  toast('Configuracoes salvas!', 3000, 'success');
}

// ── UTILS ────────────────────────────────────────
function whatsapp(tel, msg) {
  window.open('https://wa.me/55' + tel.replace(/\D/g, '') + '?text=' + encodeURIComponent(msg), '_blank');
}

// Usa o telefone do cadastro; se nao houver, pede ao usuario
function enviarWhatsapp(tel, msg) {
  if (!tel) {
    tel = prompt('Informe o telefone do cliente com DDD (ex: 11999998888):', '');
    if (!tel) return;
  }
  whatsapp(tel, msg);
}

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
