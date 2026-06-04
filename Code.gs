// ============================================================
// LojaFácil - Google Apps Script | Code.gs
// Banco de dados: planilha fixada por ID
// Deploy: Extensões > Apps Script > Implantar > Web App
//         Executar como: Eu mesmo | Acesso: Qualquer pessoa
// ============================================================

const SHEET_ID = '1Zwd9ePFpO_iNwmIXTPhFrseXJ5YpjS7KsVTDm7Fku20';

function getSpreadsheet() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function doGet(e) {
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle('LojaFácil')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Permite incluir arquivos HTML parciais (styles.html, scripts.html)
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    switch (data.action) {
      case 'salvarProduto':       return ok(salvarProduto(data.payload));
      case 'listarProdutos':      return ok(listarProdutos(data.payload.q));
      case 'deletarProduto':      return ok(deletarLinha('Produtos', data.payload.id));
      case 'salvarCliente':       return ok(salvarCliente(data.payload));
      case 'listarClientes':      return ok(listarClientes(data.payload.q));
      case 'deletarCliente':      return ok(deletarLinha('Clientes', data.payload.id));
      case 'salvarFuncionario':   return ok(salvarFuncionario(data.payload));
      case 'listarFuncionarios':  return ok(listarFuncionarios(data.payload.q));
      case 'deletarFuncionario':  return ok(deletarLinha('Funcionarios', data.payload.id));
      case 'registrarVenda':      return ok(registrarVenda(data.payload));
      case 'listarVendas':        return ok(listarVendas(data.payload));
      case 'salvarFinanceiro':    return ok(salvarFinanceiro(data.payload));
      case 'listarFinanceiro':    return ok(listarFinanceiro(data.payload));
      case 'deletarFinanceiro':   return ok(deletarLinha('Financeiro', data.payload.id));
      case 'resumoFinanceiro':    return ok(resumoFinanceiro());
      case 'relatorio':           return ok(gerarRelatorio(data.payload));
      case 'getConfig':           return ok(getConfig());
      case 'salvarConfig':        return ok(salvarConfig(data.payload));
      default: return err('Ação desconhecida: ' + data.action);
    }
  } catch(e) { return err(e.toString()); }
}

const ok  = d => resp({ ok: true,  data: d });
const err = m => resp({ ok: false, error: m });
function resp(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── SHEETS ──────────────────────────────────────────────
function getOrCreate(name, headers) {
  const ss = getSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers.length) {
      const r = sh.getRange(1, 1, 1, headers.length);
      r.setValues([headers])
       .setBackground('#7C3AED')
       .setFontColor('#fff')
       .setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

// ─── PRODUTOS ────────────────────────────────────────────
function salvarProduto(p) {
  const sh = getOrCreate('Produtos', ['ID','Nome','Categoria','Tamanho','Cor','Custo','Preco','Estoque','Barcode','DataCad']);
  const id = Date.now();
  sh.appendRow([id, p.nome, p.categoria, p.tamanho, p.cor,
    +p.custo||0, +p.preco||0, +p.estoque||0, p.barcode||gerarEAN13(), new Date().toISOString()]);
  atualizarPDV();
  return { id };
}

function listarProdutos(q) {
  const sh = getOrCreate('Produtos', ['ID','Nome','Categoria','Tamanho','Cor','Custo','Preco','Estoque','Barcode','DataCad']);
  return sh.getDataRange().getValues().slice(1)
    .filter(r => r[0] && (!q || r[1].toLowerCase().includes(q.toLowerCase()) || String(r[8]).includes(q)))
    .map(r => ({ id:r[0], nome:r[1], categoria:r[2], tamanho:r[3], cor:r[4], custo:r[5], preco:r[6], estoque:r[7], barcode:r[8] }));
}

function atualizarEstoque(prodId, qty) {
  const sh = getSpreadsheet().getSheetByName('Produtos');
  if (!sh) return;
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(prodId)) {
      sh.getRange(i+1, 8).setValue(Math.max(0, data[i][7] - qty));
      break;
    }
  }
}

// ─── CLIENTES ────────────────────────────────────────────
function salvarCliente(c) {
  const sh = getOrCreate('Clientes', ['ID','Nome','CPF','Telefone','Email','Nascimento','Endereco','Obs','DataCad']);
  const id = Date.now();
  sh.appendRow([id, c.nome, c.cpf, c.tel, c.email, c.nasc, c.end, c.obs, new Date().toISOString()]);
  return { id };
}

function listarClientes(q) {
  const sh = getOrCreate('Clientes', ['ID','Nome','CPF','Telefone','Email','Nascimento','Endereco','Obs','DataCad']);
  return sh.getDataRange().getValues().slice(1)
    .filter(r => r[0] && (!q || r[1].toLowerCase().includes(q.toLowerCase()) || String(r[2]).includes(q) || String(r[3]).includes(q)))
    .map(r => ({ id:r[0], nome:r[1], cpf:r[2], tel:r[3], email:r[4], nasc:r[5], end:r[6], obs:r[7] }));
}

// ─── FUNCIONÁRIOS ────────────────────────────────────────
function salvarFuncionario(f) {
  const sh = getOrCreate('Funcionarios', ['ID','Nome','CPF','Cargo','Telefone','Salario','Admissao','Comissao','Email','DataCad']);
  const id = Date.now();
  sh.appendRow([id, f.nome, f.cpf, f.cargo, f.tel, +f.salario||0, f.admissao, +f.comissao||0, f.email, new Date().toISOString()]);
  return { id };
}

function listarFuncionarios(q) {
  const sh = getOrCreate('Funcionarios', ['ID','Nome','CPF','Cargo','Telefone','Salario','Admissao','Comissao','Email','DataCad']);
  return sh.getDataRange().getValues().slice(1)
    .filter(r => r[0] && (!q || r[1].toLowerCase().includes(q.toLowerCase()) || r[3].toLowerCase().includes(q.toLowerCase())))
    .map(r => ({ id:r[0], nome:r[1], cpf:r[2], cargo:r[3], tel:r[4], salario:r[5], admissao:r[6], comissao:r[7], email:r[8] }));
}

// ─── VENDAS ──────────────────────────────────────────────
function registrarVenda(v) {
  const sh = getOrCreate('Vendas', ['ID','Data','Cliente','Pagamento','Itens','Subtotal','Desconto','Total']);
  const id = Date.now();
  sh.appendRow([id, new Date().toISOString(), v.cliente||'', v.pgto, JSON.stringify(v.itens), v.subtotal, v.desconto, v.total]);
  (v.itens||[]).forEach(i => atualizarEstoque(i.id, i.qty));

  // Lança automaticamente na aba Financeiro como receita
  salvarFinanceiro({
    tipo: 'Receita',
    categoria: 'Vendas',
    descricao: 'Venda #' + id + (v.cliente ? ' — ' + v.cliente : ''),
    valor: v.total,
    referencia: String(id)
  });

  return { id };
}

function listarVendas(f) {
  const sh = getOrCreate('Vendas', ['ID','Data','Cliente','Pagamento','Itens','Subtotal','Desconto','Total']);
  let rows = sh.getDataRange().getValues().slice(1)
    .filter(r => r[0])
    .map(r => ({ id:r[0], data:r[1], cliente:r[2], pgto:r[3], itens:JSON.parse(r[4]||'[]'), subtotal:r[5], desconto:r[6], total:r[7] }));
  if (f && f.q)    rows = rows.filter(v => (v.cliente||'').toLowerCase().includes(f.q.toLowerCase()) || v.pgto.toLowerCase().includes(f.q.toLowerCase()));
  if (f && f.data) rows = rows.filter(v => String(v.data).startsWith(f.data));
  return rows.reverse().slice(0, 300);
}

// ─── FINANCEIRO ──────────────────────────────────────────
function salvarFinanceiro(f) {
  const sh = getOrCreate('Financeiro', ['ID','Data','Tipo','Categoria','Descricao','Valor','Referencia','DataCad']);
  const id = f.id || Date.now();
  const valor = f.tipo === 'Receita' ? Math.abs(+f.valor||0) : -Math.abs(+f.valor||0);
  sh.appendRow([id, f.data || new Date().toISOString(), f.tipo, f.categoria, f.descricao, valor, f.referencia||'', new Date().toISOString()]);
  return { id };
}

function listarFinanceiro(f) {
  const sh = getOrCreate('Financeiro', ['ID','Data','Tipo','Categoria','Descricao','Valor','Referencia','DataCad']);
  let rows = sh.getDataRange().getValues().slice(1)
    .filter(r => r[0])
    .map(r => ({ id:r[0], data:r[1], tipo:r[2], categoria:r[3], descricao:r[4], valor:r[5], referencia:r[6] }));
  if (f && f.tipo) rows = rows.filter(r => r.tipo === f.tipo);
  if (f && f.q)    rows = rows.filter(r => r.descricao.toLowerCase().includes(f.q.toLowerCase()) || r.categoria.toLowerCase().includes(f.q.toLowerCase()));
  if (f && f.ini)  rows = rows.filter(r => String(r.data) >= f.ini);
  if (f && f.fim)  rows = rows.filter(r => String(r.data) <= f.fim + 'T23:59:59');
  return rows.reverse().slice(0, 500);
}

function resumoFinanceiro() {
  const sh = getOrCreate('Financeiro', ['ID','Data','Tipo','Categoria','Descricao','Valor','Referencia','DataCad']);
  const rows = sh.getDataRange().getValues().slice(1).filter(r => r[0]);
  const receitas = rows.filter(r => r[2] === 'Receita').reduce((s, r) => s + (+r[5]||0), 0);
  const despesas = rows.filter(r => r[2] === 'Despesa').reduce((s, r) => s + (+r[5]||0), 0);

  // Agrupado por categoria
  const porCategoria = {};
  rows.forEach(r => {
    const cat = r[3] || 'Outros';
    if (!porCategoria[cat]) porCategoria[cat] = { receita: 0, despesa: 0 };
    if (r[2] === 'Receita') porCategoria[cat].receita += +r[5]||0;
    else                    porCategoria[cat].despesa += +r[5]||0;
  });

  // Últimos 30 dias por dia
  const agora = new Date();
  const porDia = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(agora); d.setDate(d.getDate() - i);
    porDia[d.toISOString().split('T')[0]] = 0;
  }
  rows.filter(r => r[2] === 'Receita').forEach(r => {
    const dia = String(r[1]).split('T')[0];
    if (porDia[dia] !== undefined) porDia[dia] += +r[5]||0;
  });

  return { receitas, despesas, saldo: receitas + despesas, porCategoria, porDia };
}

// ─── RELATÓRIO ───────────────────────────────────────────
function gerarRelatorio(f) {
  let vendas = listarVendas({}).reverse();
  if (f.ini) vendas = vendas.filter(v => String(v.data) >= f.ini);
  if (f.fim) vendas = vendas.filter(v => String(v.data) <= f.fim + 'T23:59:59');
  if (f.pgto) vendas = vendas.filter(v => v.pgto.startsWith(f.pgto));

  const total     = vendas.reduce((s, v) => s + (v.total||0), 0);
  const qtdItens  = vendas.reduce((s, v) => s + (v.itens||[]).reduce((a, i) => a + i.qty, 0), 0);
  const porPgto   = {};
  const porProd   = {};
  const porDia    = {};

  vendas.forEach(v => {
    const k = v.pgto.split(' ')[0];
    porPgto[k] = (porPgto[k]||0) + v.total;

    const dia = String(v.data).split('T')[0];
    porDia[dia] = (porDia[dia]||0) + v.total;

    (v.itens||[]).forEach(i => {
      if (!porProd[i.nome]) porProd[i.nome] = { qty: 0, total: 0 };
      porProd[i.nome].qty   += i.qty;
      porProd[i.nome].total += i.preco * i.qty;
    });
  });

  return { total, qtdVendas: vendas.length, qtdItens, ticketMedio: vendas.length ? total/vendas.length : 0, porPgto, porProd, porDia };
}

// ─── CONFIG ──────────────────────────────────────────────
function getConfig() {
  const sh = getOrCreate('Config', ['Chave','Valor']);
  const cfg = {};
  sh.getDataRange().getValues().slice(1).forEach(r => { if (r[0]) cfg[r[0]] = r[1]; });
  return cfg;
}

function salvarConfig(cfg) {
  const sh = getOrCreate('Config', ['Chave','Valor']);
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last-1, 2).clearContent();
  Object.entries(cfg).forEach(([k, v], i) => sh.getRange(i+2, 1, 1, 2).setValues([[k, v]]));
  return { ok: true };
}

// ─── HELPERS ─────────────────────────────────────────────
function gerarEAN13() {
  const base = '789' + String(Date.now()).slice(-9);
  let s = 0;
  for (let i = 0; i < 12; i++) s += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3);
  return base + ((10 - (s % 10)) % 10);
}

function deletarLinha(sheetName, id) {
  const sh = getSpreadsheet().getSheetByName(sheetName);
  if (!sh) return { ok: false };
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sh.deleteRow(i + 1);
      if (sheetName === 'Produtos') atualizarPDV();
      return { ok: true };
    }
  }
  return { ok: false };
}

// ─── PONTO DE VENDA (aba Sheets com validação) ───────────
function atualizarPDV() {
  const ss = getSpreadsheet();
  const pdv = getOrCreate('Ponto de Venda', []);
  const MAX_LINHAS = 50;

  pdv.getRange('A1').setValue('🛒 PONTO DE VENDA').setFontSize(14).setFontWeight('bold').setFontColor('#7C3AED');
  pdv.getRange('A2:G2').setBackground('#7C3AED').setFontColor('#ffffff').setFontWeight('bold')
     .setValues([['Produto','Qtd','Preço Unit.','Total','','','']]);
  pdv.setFrozenRows(2);

  const prodSh = ss.getSheetByName('Produtos');
  if (!prodSh) return;
  const prodRows = prodSh.getDataRange().getValues().slice(1).filter(r => r[0] && r[1]);
  if (!prodRows.length) return;

  const listaProdutos = prodRows.map(r => {
    const tam = r[3] ? ` (${r[3]})` : '';
    return `${r[1]}${tam}`;
  });

  const rangeDropdown = pdv.getRange(3, 1, MAX_LINHAS, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(listaProdutos, true).setAllowInvalid(false)
    .setHelpText('Selecione um produto cadastrado').build();
  rangeDropdown.setDataValidation(rule);

  const rangeQtd = pdv.getRange(3, 2, MAX_LINHAS, 1);
  const ruleQtd = SpreadsheetApp.newDataValidation()
    .requireNumberGreaterThan(0).setAllowInvalid(false)
    .setHelpText('Digite a quantidade').build();
  rangeQtd.setDataValidation(ruleQtd);

  for (let i = 3; i <= MAX_LINHAS + 2; i++) {
    const cell = pdv.getRange(i, 2);
    if (!cell.getValue()) cell.setValue(1);
    pdv.getRange(i, 3).setFormula(`=IFERROR(INDEX(Produtos!G:G,MATCH(A${i},Produtos!B:B,0)),"")`);
    pdv.getRange(i, 4).setFormula(`=IFERROR(IF(A${i}="","",B${i}*C${i}),"")`);
  }

  pdv.getRange(3, 3, MAX_LINHAS, 2).setNumberFormat('R$ #,##0.00');
  pdv.getRange(3, 1, MAX_LINHAS, 1).setBackground('#f5f3ff');
  pdv.setColumnWidth(1, 260); pdv.setColumnWidth(2, 80);
  pdv.setColumnWidth(3, 120); pdv.setColumnWidth(4, 120);

  const totalRow = MAX_LINHAS + 3;
  pdv.getRange(totalRow, 3).setValue('TOTAL:').setFontWeight('bold').setFontColor('#7C3AED');
  pdv.getRange(totalRow, 4).setFormula(`=SUM(D3:D${MAX_LINHAS + 2})`)
     .setFontWeight('bold').setFontColor('#7C3AED').setNumberFormat('R$ #,##0.00');

  pdv.getRange(2, 1, MAX_LINHAS + 1, 4)
     .setBorder(true, true, true, true, true, false, '#7C3AED', SpreadsheetApp.BorderStyle.SOLID);
}

// ─── SETUP (rode uma vez via menu) ───────────────────────
function onOpen() {
  SpreadsheetApp.getUi().createMenu('LojaFácil')
    .addItem('⚙️ Configurar planilhas', 'setupPlanilhas')
    .addItem('🌐 Abrir Web App', 'abrirWebApp')
    .addToUi();
}

function setupPlanilhas() {
  getOrCreate('Produtos',     ['ID','Nome','Categoria','Tamanho','Cor','Custo','Preco','Estoque','Barcode','DataCad']);
  getOrCreate('Clientes',     ['ID','Nome','CPF','Telefone','Email','Nascimento','Endereco','Obs','DataCad']);
  getOrCreate('Funcionarios', ['ID','Nome','CPF','Cargo','Telefone','Salario','Admissao','Comissao','Email','DataCad']);
  getOrCreate('Vendas',       ['ID','Data','Cliente','Pagamento','Itens','Subtotal','Desconto','Total']);
  getOrCreate('Financeiro',   ['ID','Data','Tipo','Categoria','Descricao','Valor','Referencia','DataCad']);
  getOrCreate('Config',       ['Chave','Valor']);
  atualizarPDV();
  SpreadsheetApp.getUi().alert('✅ Planilhas criadas!\n\nTodas as abas foram configuradas na planilha vinculada.\nAgora implante como Web App.');
}

function abrirWebApp() {
  const url = ScriptApp.getService().getUrl();
  SpreadsheetApp.getUi().alert('URL do Web App:\n' + url);
}
