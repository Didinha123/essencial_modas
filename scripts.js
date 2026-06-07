// ================================================
// LojaFacil - scripts.js  (Supabase)
// ================================================

// 1. Crie um projeto em https://supabase.com
// 2. Vá em Project Settings → API e cole:
const SUPABASE_URL = 'https://xtgokhgzfdazreyqovrk.supabase.co';   // ex: https://xyzxyz.supabase.co
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0Z29raGd6ZmRhenJleXFvdnJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NDk3NzMsImV4cCI6MjA5NjQyNTc3M30.UGaApUPR87qs9-s3ObKjva_ED86lGC8PyO7dnFjiEcM';         // anon/public key

// ── Helper Supabase ───────────────────────────────
async function sb(table, method = 'GET', body = null, filter = '') {
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : ''
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + table + filter, opts);
  if (!res.ok && res.status !== 204) {
    const err = await res.text();
    throw new Error(err);
  }
  if (res.status === 204 || method === 'DELETE') return null;
  return res.json();
}

// ── API — mapeia as actions para Supabase ─────────
async function api(action, payload = {}) {
  try {
    // PRODUTOS
    if (action === 'salvarProduto') {
      const r = await sb('produtos', 'POST', {
        nome: payload.nome, categoria: payload.categoria, tamanho: payload.tamanho,
        cor: payload.cor, custo: +payload.custo||0, preco: +payload.preco||0,
        estoque: +payload.estoque||0, barcode: payload.barcode || gerarBarcode()
      });
      return r?.[0] || {};
    }
    if (action === 'listarProdutos') {
      const q = payload.q || '';
      let filter = '?order=criado_em.asc';
      if (q) filter += `&or=(nome.ilike.*${q}*,barcode.ilike.*${q}*)`;
      const r = await sb('produtos', 'GET', null, filter);
      return (r || []).map(p => ({
        id:p.id, nome:p.nome, categoria:p.categoria, tamanho:p.tamanho,
        cor:p.cor, custo:+p.custo, preco:+p.preco, estoque:p.estoque, barcode:p.barcode
      }));
    }
    if (action === 'deletarProduto') {
      await sb('produtos', 'DELETE', null, '?id=eq.'+payload.id);
      return { ok: true };
    }

    // CLIENTES
    if (action === 'salvarCliente') {
      const r = await sb('clientes', 'POST', {
        nome:payload.nome, cpf:payload.cpf, telefone:payload.tel,
        email:payload.email, nascimento:payload.nasc||null, endereco:payload.end, obs:payload.obs
      });
      return r?.[0] || {};
    }
    if (action === 'listarClientes') {
      const q = payload.q || '';
      let filter = '?order=criado_em.asc';
      if (q) filter += `&or=(nome.ilike.*${q}*,cpf.ilike.*${q}*,telefone.ilike.*${q}*)`;
      const r = await sb('clientes', 'GET', null, filter);
      return (r || []).map(c => ({
        id:c.id, nome:c.nome, cpf:c.cpf, tel:c.telefone,
        email:c.email, nasc:c.nascimento, end:c.endereco, obs:c.obs
      }));
    }
    if (action === 'deletarCliente') {
      await sb('clientes', 'DELETE', null, '?id=eq.'+payload.id);
      return { ok: true };
    }

    // FUNCIONÁRIOS
    if (action === 'salvarFuncionario') {
      const r = await sb('funcionarios', 'POST', {
        nome:payload.nome, cpf:payload.cpf, cargo:payload.cargo, telefone:payload.tel,
        salario:+payload.salario||0, admissao:payload.admissao||null,
        comissao:+payload.comissao||0, email:payload.email
      });
      return r?.[0] || {};
    }
    if (action === 'listarFuncionarios') {
      const q = payload.q || '';
      let filter = '?order=criado_em.asc';
      if (q) filter += `&or=(nome.ilike.*${q}*,cargo.ilike.*${q}*)`;
      const r = await sb('funcionarios', 'GET', null, filter);
      return (r || []).map(f => ({
        id:f.id, nome:f.nome, cpf:f.cpf, cargo:f.cargo, tel:f.telefone,
        salario:+f.salario, admissao:f.admissao, comissao:+f.comissao, email:f.email
      }));
    }
    if (action === 'deletarFuncionario') {
      await sb('funcionarios', 'DELETE', null, '?id=eq.'+payload.id);
      return { ok: true };
    }

    // VENDAS
    if (action === 'registrarVenda') {
      // Decrementa estoque
      for (const item of (payload.itens || [])) {
        const prod = await sb('produtos', 'GET', null, '?id=eq.'+item.id+'&select=estoque');
        if (prod?.[0]) {
          await sb('produtos', 'PATCH', { estoque: Math.max(0, prod[0].estoque - item.qty) }, '?id=eq.'+item.id);
        }
      }
      // Salva venda
      const r = await sb('vendas', 'POST', {
        cliente: payload.cliente||'', pagamento: payload.pgto,
        itens: payload.itens, subtotal: payload.subtotal,
        desconto: payload.desconto, total: payload.total
      });
      // Lança receita no financeiro
      const vId = r?.[0]?.id;
      if (vId) {
        await sb('financeiro', 'POST', {
          tipo:'Receita', categoria:'Vendas',
          descricao:'Venda #'+vId+(payload.cliente?' - '+payload.cliente:''),
          valor: payload.total, referencia: String(vId)
        });
      }
      return { id: vId };
    }
    if (action === 'listarVendas') {
      const q = payload.q || '';
      const data = payload.data || '';
      let filter = '?order=criado_em.desc&limit=300';
      if (q) filter += `&or=(cliente.ilike.*${q}*,pagamento.ilike.*${q}*)`;
      if (data) filter += `&criado_em=gte.${data}T00:00:00`;
      const r = await sb('vendas', 'GET', null, filter);
      return (r || []).map(v => ({
        id:v.id, data:v.criado_em, cliente:v.cliente, pgto:v.pagamento,
        itens:v.itens||[], subtotal:+v.subtotal, desconto:+v.desconto, total:+v.total
      }));
    }

    // FINANCEIRO
    if (action === 'salvarFinanceiro') {
      const valor = payload.tipo === 'Receita' ? Math.abs(+payload.valor) : -Math.abs(+payload.valor);
      const r = await sb('financeiro', 'POST', {
        tipo:payload.tipo, categoria:payload.categoria, descricao:payload.descricao,
        valor, referencia:payload.referencia||''
      });
      return r?.[0] || {};
    }
    if (action === 'listarFinanceiro') {
      const q = payload.q || '';
      const tipo = payload.tipo || '';
      let filter = '?order=criado_em.desc&limit=500';
      if (tipo) filter += '&tipo=eq.'+tipo;
      if (q) filter += `&or=(descricao.ilike.*${q}*,categoria.ilike.*${q}*)`;
      const r = await sb('financeiro', 'GET', null, filter);
      return (r || []).map(f => ({
        id:f.id, data:f.criado_em, tipo:f.tipo, categoria:f.categoria,
        descricao:f.descricao, valor:+f.valor, referencia:f.referencia
      }));
    }
    if (action === 'deletarFinanceiro') {
      await sb('financeiro', 'DELETE', null, '?id=eq.'+payload.id);
      return { ok: true };
    }
    if (action === 'resumoFinanceiro') {
      const r = await sb('financeiro', 'GET', null, '?order=criado_em.asc');
      const rows = r || [];
      const receitas = rows.filter(x=>x.tipo==='Receita').reduce((s,x)=>s+(+x.valor||0),0);
      const despesas = rows.filter(x=>x.tipo==='Despesa').reduce((s,x)=>s+(+x.valor||0),0);
      const agora = new Date();
      const porDia = {};
      for (let i=29;i>=0;i--) {
        const d=new Date(agora); d.setDate(d.getDate()-i);
        porDia[d.toISOString().split('T')[0]]=0;
      }
      rows.filter(x=>x.tipo==='Receita').forEach(x=>{
        const dia=String(x.criado_em).split('T')[0];
        if(porDia[dia]!==undefined) porDia[dia]+=(+x.valor||0);
      });
      return { receitas, despesas, saldo:receitas+despesas, porDia };
    }
    if (action === 'relatorio') {
      const vendas = await api('listarVendas', {});
      let filtradas = vendas;
      if (payload.ini) filtradas = filtradas.filter(v=>String(v.data)>=payload.ini);
      if (payload.fim) filtradas = filtradas.filter(v=>String(v.data)<=payload.fim+'T23:59:59');
      if (payload.pgto) filtradas = filtradas.filter(v=>v.pgto&&v.pgto.startsWith(payload.pgto));
      const total = filtradas.reduce((s,v)=>s+(v.total||0),0);
      const qtdItens = filtradas.reduce((s,v)=>s+(v.itens||[]).reduce((a,i)=>a+i.qty,0),0);
      const porPgto={}, porProd={}, porDia={};
      filtradas.forEach(v=>{
        const k=(v.pgto||'').split(' ')[0]; porPgto[k]=(porPgto[k]||0)+v.total;
        const dia=String(v.data).split('T')[0]; porDia[dia]=(porDia[dia]||0)+v.total;
        (v.itens||[]).forEach(i=>{
          if(!porProd[i.nome]) porProd[i.nome]={qty:0,total:0};
          porProd[i.nome].qty+=i.qty; porProd[i.nome].total+=i.preco*i.qty;
        });
      });
      return {total,qtdVendas:filtradas.length,qtdItens,ticketMedio:filtradas.length?total/filtradas.length:0,porPgto,porProd,porDia};
    }

    // CONFIG
    if (action === 'getConfig') {
      const r = await sb('config', 'GET', null, '?select=chave,valor');
      const cfg = {};
      (r||[]).forEach(x=>cfg[x.chave]=x.valor);
      return cfg;
    }
    if (action === 'salvarConfig') {
      for (const [chave, valor] of Object.entries(payload)) {
        const ex = await sb('config','GET',null,'?chave=eq.'+chave+'&select=id');
        if (ex?.[0]) { await sb('config','PATCH',{valor},'?chave=eq.'+chave); }
        else { await sb('config','POST',{chave,valor}); }
      }
      return { ok: true };
    }

    throw new Error('Ação desconhecida: ' + action);
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

// ── ESTADO ──────────────────────────────────────
let cart = [];
let pgtoAtual = 'dinheiro';
let cfg = {};
let produtosCache = [];
let chartVendas = null;
let chartPgto = null;

// ── INIT ─────────────────────────────────────────
window.onload = async () => {
  renderClock();
  cfg = await api('getConfig').catch(() => ({}));
  loadConfigUI();
  renderDashboard();
  const hoje = new Date().toISOString().split('T')[0];
  const fd = document.getElementById('fin-data');
  if (fd) fd.value = hoje;
};

// ── NAVEGAÇÃO ────────────────────────────────────
const PAGE_META = {
  dashboard:    ['Dashboard', 'Visao geral da loja'],
  pdv:          ['Ponto de Venda', 'Registre novas vendas'],
  produtos:     ['Produtos', 'Catalogo e estoque'],
  clientes:     ['Clientes', 'Base de clientes'],
  funcionarios: ['Funcionarios', 'Equipe da loja'],
  financeiro:   ['Financeiro', 'Receitas, despesas e saldo'],
  vendas:       ['Historico de Vendas', 'Todas as vendas'],
  relatorio:    ['Relatorios', 'Analise de desempenho'],
  config:       ['Configuracoes', 'Dados da loja']
};

const PAGE_ORDER = ['dashboard','pdv','produtos','clientes','funcionarios','financeiro','vendas','relatorio','config'];

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
  el.style.background = type === 'danger' ? '#B91C1C' : type === 'success' ? '#065F46' : '#1E293B';
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
  const [vendas, prods, clis, fin] = await Promise.all([
    api('listarVendas', {}).catch(() => []),
    api('listarProdutos', { q: '' }).catch(() => []),
    api('listarClientes', { q: '' }).catch(() => []),
    api('resumoFinanceiro').catch(() => ({ receitas: 0, despesas: 0, saldo: 0, porDia: {} }))
  ]);

  const hoje       = new Date().toISOString().split('T')[0];
  const vHoje      = vendas.filter(v => String(v.data).startsWith(hoje));
  const totalHoje  = vHoje.reduce((s, v) => s + (v.total || 0), 0);
  const totalGeral = vendas.reduce((s, v) => s + (v.total || 0), 0);
  const semEstoque = prods.filter(p => p.estoque <= 0).length;
  const estBaixo   = prods.filter(p => p.estoque > 0 && p.estoque <= 5).length;

  // Alertas
  let alertsHTML = '';
  if (semEstoque > 0) alertsHTML += `<div class="alert-bar danger"><span class="alert-text">${semEstoque} produto(s) sem estoque!</span></div>`;
  if (estBaixo   > 0) alertsHTML += `<div class="alert-bar"><span class="alert-text" style="color:#92400E">${estBaixo} produto(s) com estoque baixo (5 ou menos)</span></div>`;
  document.getElementById('dash-alerts').innerHTML = alertsHTML;

  // KPIs
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

  // Chart vendas 7 dias
  const labels7 = [], vals7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = d.toISOString().split('T')[0];
    labels7.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
    vals7.push(fin.porDia?.[k] || 0);
  }
  if (chartVendas) chartVendas.destroy();
  chartVendas = new Chart(document.getElementById('chart-vendas').getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels7,
      datasets: [{ label: 'Vendas', data: vals7, backgroundColor: 'rgba(124,58,237,.2)', borderColor: '#7C3AED', borderWidth: 2, borderRadius: 6 }]
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

  // Chart pagamento
  const pgtoMap = {};
  vendas.forEach(v => { const k = v.pgto.split(' ')[0]; pgtoMap[k] = (pgtoMap[k] || 0) + v.total; });
  if (chartPgto) chartPgto.destroy();
  if (Object.keys(pgtoMap).length) {
    chartPgto = new Chart(document.getElementById('chart-pgto').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(pgtoMap),
        datasets: [{ data: Object.values(pgtoMap), backgroundColor: ['#7C3AED','#EC4899','#10B981','#F59E0B','#3B82F6','#EF4444'], borderWidth: 2, borderColor: '#fff' }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10 } } } }
    });
  }

  // Ultimas vendas
  const ultimas = vendas.slice(0, 8);
  document.getElementById('dashboard-table').innerHTML = ultimas.length
    ? `<table><thead><tr><th>Data</th><th>Cliente</th><th>Pagamento</th><th>Itens</th><th>Total</th></tr></thead><tbody>
       ${ultimas.map(v => `<tr>
         <td style="color:var(--muted);font-size:.82rem">${new Date(v.data).toLocaleString('pt-BR')}</td>
         <td><b>${v.cliente || '-'}</b></td>
         <td><span class="badge badge-purple">${v.pgto.split(' ')[0]}</span></td>
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
           <td><code style="font-size:.78rem;background:var(--bg);padding:2px 6px;border-radius:4px">${p.barcode}</code></td>
           <td><b>${p.nome}</b></td><td>${p.categoria}</td><td>${p.tamanho}</td><td>${p.cor || '-'}</td>
           <td style="color:var(--muted)">${fmtMoney(p.custo)}</td>
           <td><b style="color:var(--p1)">${fmtMoney(p.preco)}</b></td>
           <td><span class="badge badge-info">${margem}</span></td>
           <td><span class="badge ${estoqClass}">${p.estoque} un.</span></td>
           <td style="white-space:nowrap">
             <button class="btn btn-sm btn-outline" onclick='showEtiqueta(${JSON.stringify(p)})'>Etiqueta</button>
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

function showEtiqueta(prod) {
  const preview = document.getElementById('etiqueta-preview');
  preview.innerHTML = `
    <div style="font-family:monospace;max-width:280px;margin:0 auto;background:#fff;padding:16px;border-radius:8px">
      <div style="font-size:.8rem;color:var(--muted);margin-bottom:2px">${cfg.nome || 'Minha Loja'}</div>
      <div style="font-size:1.05rem;font-weight:700;margin-bottom:2px">${prod.nome}</div>
      <div style="font-size:.85rem;color:var(--muted);margin-bottom:4px">${prod.tamanho || ''}${prod.cor ? ' - ' + prod.cor : ''}</div>
      <div style="font-size:1.4rem;font-weight:800;color:var(--p1);margin-bottom:8px">${fmtMoney(prod.preco)}</div>
      <svg id="barcode-etq"></svg>
    </div>`;
  openModal('modal-etiqueta');
  setTimeout(() => {
    try { JsBarcode('#barcode-etq', prod.barcode, { format: 'CODE128', width: 2, height: 50, displayValue: true, fontSize: 12 }); } catch (e) {}
  }, 100);
  document.getElementById('print-area').innerHTML = preview.innerHTML;
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
         <td><b>${c.nome}</b></td><td>${c.cpf || '-'}</td><td>${c.tel || '-'}</td><td>${c.email || '-'}</td>
         <td>${c.nasc ? new Date(c.nasc + 'T12:00').toLocaleDateString('pt-BR') : '-'}</td>
         <td style="white-space:nowrap">
           ${c.tel ? `<button class="btn btn-sm btn-success" onclick="whatsapp('${c.tel}','Ola ${c.nome}!')">WhatsApp</button>` : ''}
           <button class="btn btn-sm btn-ghost" onclick="deletarCliente(${c.id})">Excluir</button>
         </td>
       </tr>`).join('')}</tbody></table>`
    : '<div class="empty-state"><div class="es-icon">&#128101;</div><div class="es-text">Nenhum cliente cadastrado.</div></div>';
}

async function carregarClientesPDV() {
  const sel  = document.getElementById('pdv-cliente');
  if (!sel) return;
  const clis = await api('listarClientes', { q: '' }).catch(() => []);
  sel.innerHTML = '<option value="">-- Consumidor final --</option>' + clis.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
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
         <td><b>${f.nome}</b><br><span style="font-size:.78rem;color:var(--muted)">${f.email || ''}</span></td>
         <td><span class="badge badge-purple">${f.cargo}</span></td>
         <td>${fmtMoney(f.salario)}</td>
         <td><span class="badge badge-info">${f.comissao}%</span></td>
         <td>${f.admissao ? new Date(f.admissao + 'T12:00').toLocaleDateString('pt-BR') : '-'}</td>
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
  sEl.style.color = r.saldo >= 0 ? '#6D28D9' : '#B91C1C';
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
           <td style="color:var(--muted);font-size:.82rem">${new Date(f.data).toLocaleDateString('pt-BR')}</td>
           <td><span class="badge ${isRec ? 'badge-success' : 'badge-danger'}">${f.tipo}</span></td>
           <td><span class="badge badge-purple">${f.categoria}</span></td>
           <td>${f.descricao}</td>
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
  const prods = produtosCache.filter(p => p.nome.toLowerCase().includes(q) || p.barcode.includes(q)).slice(0, 6);
  res.innerHTML = prods.length
    ? prods.map(p => `
        <div class="prod-result-item" onclick="addToCart(${p.id})">
          <div>
            <b>${p.nome}</b>
            <div style="font-size:.78rem;color:var(--muted)">Tam: ${p.tamanho} - ${p.barcode}</div>
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
            <div class="cart-item-name">${item.nome}</div>
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
  document.getElementById('sub-val').textContent    = fmtMoney(sub);
  document.getElementById('cart-total').textContent = fmtMoney(Math.max(0, sub - desc));
  calcJuros();
  calcBoleto();
}

function selectPgto(el, tipo) {
  document.querySelectorAll('.pgto-btn').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  pgtoAtual = tipo;
  document.getElementById('juros-box').style.display  = tipo === 'credito' ? 'block' : 'none';
  document.getElementById('boleto-box').style.display = tipo === 'boleto'  ? 'block' : 'none';
}

function getTotal() {
  const sub = cart.reduce((s, i) => s + i.preco * i.qty, 0);
  return Math.max(0, sub - (parseFloat(document.getElementById('desc-val').value) || 0));
}

function calcJuros() {
  if (pgtoAtual !== 'credito') return;
  const parc  = parseInt(document.getElementById('parcelas').value);
  const jMap  = { 1: 0, 2: +(cfg.j2||0), 3: +(cfg.j3||2), 6: +(cfg.j6||4), 12: +(cfg.j12||8) };
  const pct   = jMap[parc] || 0;
  const total = getTotal();
  const totalJ = total * (1 + pct / 100);
  document.getElementById('juros-result').innerHTML = pct > 0
    ? `<span style="color:var(--danger)">${parc}x de ${fmtMoney(totalJ / parc)} - ${pct}% juros - Total: ${fmtMoney(totalJ)}</span>`
    : `<span style="color:var(--success)">${parc}x de ${fmtMoney(totalJ / parc)} sem juros</span>`;
}

function calcBoleto() {
  if (pgtoAtual !== 'boleto') return;
  const pct    = parseFloat(document.getElementById('boleto-juros').value) || 0;
  const totalJ = getTotal() * (1 + pct / 100);
  document.getElementById('boleto-result').innerHTML = pct > 0
    ? `<span style="color:var(--danger)">Total com juros: ${fmtMoney(totalJ)}</span>`
    : `<span style="color:var(--muted)">Total: ${fmtMoney(totalJ)}</span>`;
}

function clearCart() { cart = []; renderCart(); }

async function finalizarVenda() {
  if (!cart.length) { toast('Carrinho vazio!'); return; }
  const sub  = cart.reduce((s, i) => s + i.preco * i.qty, 0);
  const desc = parseFloat(document.getElementById('desc-val').value) || 0;
  let total  = Math.max(0, sub - desc);
  let jurosInfo = '';

  if (pgtoAtual === 'credito') {
    const parc = parseInt(document.getElementById('parcelas').value);
    const jMap = { 1: 0, 2: +(cfg.j2||0), 3: +(cfg.j3||2), 6: +(cfg.j6||4), 12: +(cfg.j12||8) };
    const pct  = jMap[parc] || 0;
    total = total * (1 + pct / 100);
    jurosInfo = parc > 1 ? ` (${parc}x - ${pct}% juros)` : ' (a vista)';
  }
  if (pgtoAtual === 'boleto') {
    const pct = parseFloat(document.getElementById('boleto-juros').value) || 0;
    total = total * (1 + pct / 100);
    if (pct > 0) jurosInfo = ` (+${pct}% juros)`;
  }

  const venda = {
    cliente:  document.getElementById('pdv-cliente').value,
    pgto:     pgtoAtual + jurosInfo,
    itens:    [...cart],
    subtotal: sub,
    desconto: desc,
    total
  };

  const r = await api('registrarVenda', venda).catch(() => null);
  if (!r) { toast('Erro ao registrar venda!'); return; }
  showModalVenda({ ...venda, id: r.id, data: new Date().toISOString() });
  clearCart();
  document.getElementById('desc-val').value = 0;
  produtosCache = await api('listarProdutos', { q: '' }).catch(() => produtosCache);
}

function showModalVenda(v) {
  const loja = cfg.nome || 'Minha Loja';
  document.getElementById('modal-venda-title').textContent = 'Venda Finalizada!';
  document.getElementById('modal-venda-body').innerHTML = `
    <div class="nota" id="nota-content">
      <div class="nota-header">
        <b style="font-size:1.05rem">${loja}</b><br>
        <span style="font-size:.78rem;color:var(--muted)">${cfg.cnpj || ''} ${cfg.cidade ? '- ' + cfg.cidade : ''}</span><br>
        <b style="margin-top:6px;display:block">RECIBO DE VENDA</b>
        <span style="color:var(--muted);font-size:.78rem">#${v.id} - ${new Date(v.data).toLocaleString('pt-BR')}</span>
      </div>
      <div style="margin-bottom:8px"><b>Cliente:</b> ${v.cliente || 'Consumidor final'}</div>
      ${v.itens.map(i => `<div class="nota-row"><span>${i.nome} (${i.qty}x)</span><span>${fmtMoney(i.preco * i.qty)}</span></div>`).join('')}
      <div class="nota-total">
        <div class="nota-row"><span>Subtotal</span><span>${fmtMoney(v.subtotal)}</span></div>
        ${v.desconto > 0 ? `<div class="nota-row" style="color:var(--danger)"><span>Desconto</span><span>- ${fmtMoney(v.desconto)}</span></div>` : ''}
        <div class="nota-row" style="font-size:1.1rem;font-weight:800;color:var(--p1)"><span>TOTAL</span><span>${fmtMoney(v.total)}</span></div>
        <div style="margin-top:6px;font-size:.88rem"><b>Pagamento:</b> ${v.pgto}</div>
      </div>
      <div class="nota-footer">Obrigado pela preferencia!</div>
    </div>`;
  document.getElementById('modal-venda-actions').innerHTML = `
    <button class="btn btn-primary" onclick="imprimirNota()">Imprimir Recibo</button>
    <button class="btn btn-outline" onclick="closeModal('modal-venda')">Fechar</button>`;
  openModal('modal-venda');
}

function imprimirNota() {
  document.getElementById('print-area').innerHTML = document.getElementById('nota-content').outerHTML;
  window.print();
}

// ── HISTORICO ────────────────────────────────────
async function carregarVendas() {
  const q    = (document.getElementById('search-venda') || {}).value || '';
  const data = (document.getElementById('filter-data')  || {}).value || '';
  const vendas = await api('listarVendas', { q, data }).catch(() => []);
  const el = document.getElementById('table-vendas');
  if (!el) return;
  el.innerHTML = vendas.length
    ? `<table><thead><tr><th>Data</th><th>Cliente</th><th>Itens</th><th>Pagamento</th><th>Subtotal</th><th>Desconto</th><th>Total</th></tr></thead><tbody>
       ${vendas.map(v => `<tr>
         <td style="color:var(--muted);font-size:.82rem">${new Date(v.data).toLocaleString('pt-BR')}</td>
         <td><b>${v.cliente || '-'}</b></td>
         <td style="color:var(--muted)">${(v.itens || []).map(i => i.nome + ' x' + i.qty).join(', ')}</td>
         <td><span class="badge badge-purple">${v.pgto}</span></td>
         <td style="color:var(--muted)">${fmtMoney(v.subtotal)}</td>
         <td style="color:var(--danger)">${v.desconto > 0 ? '- ' + fmtMoney(v.desconto) : '-'}</td>
         <td><b style="color:var(--p1)">${fmtMoney(v.total)}</b></td>
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
          <td><span class="badge badge-purple">${k}</span></td>
          <td><b>${fmtMoney(v)}</b></td>
          <td>${rel.total ? ((v / rel.total) * 100).toFixed(1) : 0}%</td>
        </tr>`).join('')}</tbody></table>
      </div>
      <div class="card">
        <div class="card-title"><div class="ct-icon">&#127942;</div> Mais Vendidos</div>
        <table><thead><tr><th>Produto</th><th>Qtd</th><th>Total</th></tr></thead><tbody>
        ${Object.entries(rel.porProd).sort((a, b) => b[1].qty - a[1].qty).slice(0, 8).map(([k, v]) => `<tr>
          <td><b>${k}</b></td>
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
    if (el) el.value = cfg[k] !== undefined ? cfg[k] : (k === 'j2' ? 0 : k === 'j3' ? 2 : k === 'j6' ? 4 : 8);
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

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

docum
