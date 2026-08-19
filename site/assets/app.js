/* Observatório Nacional dos Depósitos Judiciais — frontend estático.
   Lê window.__DATA__ (gerado por pipeline/export_outputs.py). Sem chamadas externas. */
(function () {
"use strict";
const D = window.__DATA__;
if (!D) { document.getElementById("main").textContent = "Dados não carregados (data/data.js ausente). Rode o pipeline."; return; }

const LAST = D.meta.ultima_data_base;
const $ = (s, el) => (el || document).querySelector(s);
const el = (tag, attrs, html) => { const e = document.createElement(tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (html !== undefined) e.innerHTML = html; return e; };

// ---------- formatação ----------
const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const mLabel = ym => ym ? `${MESES[+String(ym).slice(4,6)-1]}/${String(ym).slice(0,4)}` : "n/d";
const bi = v => v==null ? "n/d" : (v/1e9).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1});
const rbi = v => v==null ? "n/d" : `R$ ${bi(v)} bi`;
const pct = (v,d) => v==null ? "n/d" : (v*100).toLocaleString("pt-BR",{minimumFractionDigits:d==null?1:d,maximumFractionDigits:d==null?1:d}) + "%";
const rx = v => v==null ? "n/d" : v.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1}) + "×";
const brl = v => v==null ? "n/d" : "R$ " + v.toLocaleString("pt-BR",{maximumFractionDigits:2});

// ---------- tema / cores ----------
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const BANK_SLOT = { "00000000":"--s1", "00360305":"--s2", "00000208":"--s3", "92702067":"--s4" };
const bankColor = cnpj => cssVar(BANK_SLOT[cnpj] || "--muted");
const ENTE_SLOT = { "Uniao":"--s1", "Estados e DF":"--s2", "Municipios":"--s3" };
const CONCEITO_SLOT = { A:"--s1", B:"--s2", C:"--s7" };

// ---------- dados derivados ----------
const bancosUlt = D.bancos.ultima_por_banco.slice()
  .sort((a,b)=>(b.mantidos||0)-(a.mantidos||0));
const serieNac = D.nacional.serie;
const nacUlt = D.nacional.ultima;
const ausentes = D.nacional.ausentes_ultima_base;
const BRB = D.bancos.series["00000208"] || [];
const brbLast = BRB.length ? BRB[BRB.length-1] : null;

// ---------- ECharts base ----------
const charts = [];
function baseOpt() {
  return {
    textStyle:{ fontFamily:'system-ui,-apple-system,"Segoe UI",sans-serif', color:cssVar("--ink2") },
    grid:{ left:8, right:20, top:26, bottom:8, containLabel:true },
    tooltip:{ backgroundColor:cssVar("--surface"), borderColor:cssVar("--grid"),
      textStyle:{ color:cssVar("--ink"), fontSize:12.5 }, confine:true },
    animationDuration:250,
  };
}
function mkChart(dom, optFn) {
  const c = echarts.init(dom, null, {renderer:"canvas"});
  const render = () => c.setOption(Object.assign(baseOpt(), optFn()), true);
  render();
  charts.push({c, render});
  return c;
}
new ResizeObserver(() => charts.forEach(x=>x.c.resize())).observe(document.body);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
  setTimeout(()=>charts.forEach(x=>x.render()), 30));
const axCommon = () => ({ axisLine:{lineStyle:{color:cssVar("--baseline")}},
  axisTick:{show:false}, axisLabel:{color:cssVar("--muted"), fontSize:11.5},
  splitLine:{lineStyle:{color:cssVar("--grid"), width:1}} });

// ---------- modal de auditabilidade ----------
const modal = $("#modal");
function showAudit(titulo, conceito, formula, contas, dataBase, linhas, extra) {
  const rows = (linhas||[]).map(r =>
    `<tr><td>${r.nome_instituicao}</td><td class="num">${brl(r.saldo)}</td>
     <td class="num">${r.linha_arquivo}</td><td><code>${(r.sha256_arquivo||"").slice(0,12)}…</code></td></tr>`).join("");
  modal.innerHTML = `
    <h4>Como este número foi calculado?</h4>
    <div class="kv">
      <div>Indicador</div><div><b>${titulo}</b></div>
      <div>Conceito</div><div>${conceito}</div>
      <div>Fórmula</div><div><code>${formula}</code></div>
      <div>Contas Cosif</div><div>${contas}</div>
      <div>Data-base</div><div>${mLabel(dataBase)}</div>
      <div>Documento</div><div>4010 — balancete individual da entidade legal (segmento Bancos)</div>
      <div>Fonte</div><div>${D.meta.fonte_principal}<br><a href="${D.meta.url_fonte}" target="_blank" rel="noopener">${D.meta.url_fonte}</a></div>
      ${extra ? `<div>Observação</div><div>${extra}</div>` : ""}
    </div>
    ${rows ? `<div class="tablewrap" style="max-height:260px;overflow:auto"><table>
      <thead><tr><th>Instituição (linha original)</th><th class="num">Saldo (R$)</th>
      <th class="num">Linha no CSV</th><th>SHA-256 do arquivo</th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : ""}
    <p class="note">Rastreabilidade completa (arquivo bruto, URL, hash, linha) em
      <code>data/exports/fact_saldo_bcb.csv</code> e na página Metodologia.</p>
    <button class="ghost" onclick="this.closest('dialog').close()">Fechar</button>`;
  modal.showModal();
}
function linhasConta(conta, db) {
  return D.fact_saldo_bcb.filter(r => r.conta===conta && r.data_base===+db || (r.conta===conta && String(r.data_base)===String(db)))
    .sort((a,b)=>b.saldo-a.saldo);
}

// ---------- helpers de tabela ----------
function sortableTable(cols, rows, opts) {
  // cols: [{k, label, num, fmt, html}]
  const wrap = el("div", {class:"tablewrap"});
  const table = el("table");
  let sortK = (opts&&opts.sortK)||null, asc = false;
  const draw = () => {
    let rs = rows.slice();
    if (sortK) rs.sort((a,b) => {
      const x=a[sortK], y=b[sortK];
      if (x==null) return 1; if (y==null) return -1;
      return (typeof x==="number" ? x-y : String(x).localeCompare(String(y))) * (asc?1:-1);
    });
    table.innerHTML = "<thead><tr>" + cols.map(c =>
      `<th class="sortable ${c.num?'num':''}" data-k="${c.k}">${c.label}${sortK===c.k?(asc?" ↑":" ↓"):""}</th>`).join("") +
      "</tr></thead><tbody>" + rs.map(r => "<tr>" + cols.map(c => {
        const v = r[c.k];
        const txt = c.html ? c.html(r) : (c.fmt ? c.fmt(v, r) : (v==null?"n/d":v));
        return `<td class="${c.num?'num':''}">${txt}</td>`;
      }).join("") + "</tr>").join("") + "</tbody>";
    table.querySelectorAll("th").forEach(th => th.onclick = () => {
      const k = th.dataset.k; if (sortK===k) asc=!asc; else {sortK=k; asc=false;} draw();
    });
  };
  draw();
  wrap.appendChild(table);
  return wrap;
}
function csvButton(nome, cols, rows) {
  const b = el("button",{class:"ghost"},"Exportar CSV");
  b.onclick = async () => {
    const esc = s => `"${String(s==null?"":s).replace(/"/g,'""')}"`;
    const csv = [cols.map(c=>esc(c.label)).join(";")]
      .concat(rows.map(r=>cols.map(c=>esc(r[c.k])).join(";"))).join("\n");
    // No viewer de artifacts do claude.ai, downloads passam pela capability;
    // no site estático (GitHub Pages/local), via Blob.
    if (window.claude && typeof window.claude.use === "function") {
      const dl = await window.claude.use("downloads");
      if (dl) { try { await dl.save({filename:nome, data:"﻿"+csv}); } catch (e) {} return; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿"+csv],{type:"text/csv"}));
    a.download = nome; a.click();
  };
  return b;
}

// ==================================================================
// PÁGINAS
// ==================================================================
const PAGES = [
  ["nacional","1 · Visão Nacional"], ["onde","2 · Onde estão os recursos?"],
  ["bancos","3 · Bancos e exposição"], ["brb","4 · Dossiê BRB"],
  ["contratos","5 · Contratos"], ["fiscal","6 · Uso fiscal e reservas"],
  ["eventos","7 · Eventos e monitoramento"], ["metodo","8 · Metodologia e auditoria"],
];

function pageNacional(pg) {
  pg.append(el("h2",null,"Visão Nacional"),
    el("p",{class:"lead"},`Três conceitos distintos — nunca um único número. Data-base: <b>${mLabel(LAST)}</b> (última publicada pelo BCB). Agregado inclui depósitos <b>judiciais e administrativos</b>.`));

  const cards = el("div",{class:"cards"});
  const mk = (letra, titulo, valor, sub, conceito, formula, contas, linhas, extra) => {
    const c = el("div",{class:"card"});
    c.append(el("div",{class:"label"},`<b>${letra}.</b> ${titulo}`),
      el("div",{class:"value"},`${bi(valor)} <small>R$ bi</small>`),
      el("div",{class:"meta"},sub));
    const b = el("button",{class:"linkish"},"Como este número foi calculado?");
    b.onclick = () => showAudit(titulo, conceito, formula, contas, LAST, linhas, extra);
    c.append(b); cards.append(c); };
  mk("A","Saldo mantido nos bancos", nacUlt.mantidos_total,
    `${mLabel(LAST)} · ${nacUlt.n_instituicoes_mantidos} instituições presentes · passivo dos bancos`,
    "Depósitos judiciais e administrativos mantidos nas instituições financeiras (funding no balanço do banco).",
    "SOMA(saldo da conta 4.1.5.50.00.00-9, todas as instituições presentes no doc. 4010)",
    "4.1.5.50.00.00-9 (4155000009)", linhasConta("4155000009", LAST));
  mk("B","Saldo repassado aos entes públicos", nacUlt.repassado_total,
    `União ${rbi(nacUlt.rep_uniao)} · Estados/DF ${rbi(nacUlt.rep_estados_df)} · Municípios ${rbi(nacUlt.rep_municipios)}`,
    "Valores já transferidos à União, estados, DF e municípios (contas de controle da classe 9). O dinheiro pode já estar fora do banco: é obrigação de restituição do ente público.",
    "SOMA(9.0.9.07) + SOMA(9.0.9.08) + SOMA(9.0.9.09)",
    "9.0.9.07 / 9.0.9.08 / 9.0.9.09 (classe 9 — o espelho da classe 3 não é somado)",
    [].concat(linhasConta("9090700005",LAST),linhasConta("9090800008",LAST),linhasConta("9090900001",LAST)));
  mk("C","Estoque ampliado sob administração ou registro", nacUlt.estoque_ampliado,
    "= A + B · NÃO é “dinheiro depositado nos bancos”",
    "Conceito derivado: soma do saldo mantido (A) e dos valores repassados (B). Interpretação validada contra a estrutura Cosif; os repassados constituem obrigação potencial de restituição dos entes.",
    "A + B", "4.1.5.50 + 9.0.9.07/08/09", null,
    "Não denominar como “dinheiro nos bancos”: os valores repassados já podem ter sido usados pelos entes públicos.");
  pg.append(cards);

  // cobertura / ausências
  const aus = ausentes.map(a =>
    `<b>${a.nome_instituicao}</b> — última base ${mLabel(a.ultima_data_base)} (mantidos ${rbi(a.ultimo_saldo_mantidos)}, ampliado ${rbi(a.ultimo_estoque_ampliado)})`).join("; ");
  pg.append(el("div",{class:"aviso"},
    `<b>Cobertura e confiança.</b> Fonte: doc. 4010, segmento Bancos, ${nacUlt.n_instituicoes_mantidos} instituições na data-base.
     ${ausentes.length? `Instituições <b>ausentes</b> desta data-base (valores NÃO somados — datas distintas): ${aus}.` : "Nenhuma ausência detectada."}
     Controle de qualidade da execução: <b>${D.meta.resultado_qualidade}</b> (18 testes, ver Metodologia).
     Cooperativas de crédito e demais segmentos não-bancários não estão incluídos (limitação documentada).`));

  // série
  const ch1 = el("div",{class:"chart"});
  ch1.append(el("div",{class:"title"},"Evolução mensal — os três conceitos (R$ bi)"),
    el("div",{class:"subtitle"},"Documento 4010, todas as instituições presentes em cada mês. A saída do BRB da base a partir de out–dez/2025 reduz A e C (ausência ≠ queda)."),
    el("div",{class:"plot"}));
  pg.append(ch1);
  mkChart($(".plot",ch1), () => ({
    color:[cssVar(CONCEITO_SLOT.A),cssVar(CONCEITO_SLOT.B),cssVar(CONCEITO_SLOT.C)],
    legend:{ top:0, textStyle:{color:cssVar("--ink2"),fontSize:12} },
    xAxis:Object.assign(axCommon(),{type:"category",data:serieNac.map(r=>mLabel(r.data_base)),splitLine:{show:false}}),
    yAxis:Object.assign(axCommon(),{type:"value",axisLabel:{formatter:v=>(v/1e9).toLocaleString("pt-BR"),color:cssVar("--muted")}}),
    tooltip:Object.assign(baseOpt().tooltip,{trigger:"axis",valueFormatter:v=>rbi(v)}),
    series:[
      {name:"A · Mantidos nos bancos",type:"line",lineStyle:{width:2},symbolSize:8,data:serieNac.map(r=>r.mantidos_total)},
      {name:"B · Repassados aos entes",type:"line",lineStyle:{width:2},symbolSize:8,data:serieNac.map(r=>r.repassado_total)},
      {name:"C · Estoque ampliado",type:"line",lineStyle:{width:2},symbolSize:8,data:serieNac.map(r=>r.estoque_ampliado)},
    ]}));

  // ranking + concentração
  pg.append(el("h3",null,"Ranking das instituições — saldo mantido"));
  const selRow = el("div",{class:"filters"});
  const selDate = el("select");
  serieNac.map(r=>r.data_base).reverse().forEach(d=>selDate.append(el("option",{value:d},mLabel(d))));
  const selMode = el("select");
  [["abs","R$ bilhões"],["pct","% do total"]].forEach(([v,t])=>selMode.append(el("option",{value:v},t)));
  selRow.append(el("span",{class:"note"},"Data-base:"),selDate,el("span",{class:"note"},"Visão:"),selMode);
  pg.append(selRow);
  const ch2 = el("div",{class:"chart"}); ch2.append(el("div",{class:"plot tall"})); pg.append(ch2);
  const drawRank = () => {
    const db = selDate.value, mode = selMode.value;
    const rows = Object.entries(D.bancos.series).map(([cnpj,s]) => {
      const r = s.find(x=>String(x.data_base)===String(db));
      const nome = (bancosUlt.find(b=>b.cnpj_raiz===cnpj)||{}).nome_curto||cnpj;
      return r && r.mantidos!=null ? {cnpj,nome,v:r.mantidos} : null;
    }).filter(Boolean).sort((a,b)=>a.v-b.v);
    const tot = rows.reduce((s,r)=>s+r.v,0);
    rankChart.setOption(Object.assign(baseOpt(),{
      xAxis:Object.assign(axCommon(),{type:"value",axisLabel:{formatter:v=>mode==="abs"?(v/1e9).toLocaleString("pt-BR"):pct(v/tot,0),color:cssVar("--muted")}}),
      yAxis:Object.assign(axCommon(),{type:"category",data:rows.map(r=>r.nome),splitLine:{show:false}}),
      tooltip:Object.assign(baseOpt().tooltip,{valueFormatter:v=>`${rbi(v)} (${pct(v/tot)})`}),
      series:[{type:"bar",barMaxWidth:18,itemStyle:{borderRadius:[0,4,4,0],color:p=>bankColor(rows[p.dataIndex].cnpj)},
        label:{show:true,position:"right",color:cssVar("--ink2"),fontSize:11.5,
          formatter:p=>mode==="abs"?bi(p.value):pct(p.value/tot)},
        data:rows.map(r=>r.v)}],
    }),true);
  };
  const rankChart = echarts.init($(".plot",ch2)); charts.push({c:rankChart,render:drawRank});
  selDate.onchange = selMode.onchange = drawRank; drawRank();

  const k = el("div",{class:"kpirow"});
  [["CR1 (maior banco)",pct(nacUlt.cr1)],["CR2",pct(nacUlt.cr2)],["CR5",pct(nacUlt.cr5)],
   ["HHI (0–10.000)",Math.round(nacUlt.hhi).toLocaleString("pt-BR")+" — mercado altamente concentrado"]]
    .forEach(([l,v])=>{const c=el("div",{class:"card small"});
      c.append(el("div",{class:"label"},l),el("div",{class:"value"},v),
        el("div",{class:"meta"},`sobre o saldo mantido · ${mLabel(LAST)}`));k.append(c);});
  pg.append(el("h3",null,"Concentração do mercado"),k,
    el("p",{class:"note"},"HHI acima de 2.500 caracteriza mercado altamente concentrado (referência usual antitruste). O índice é calculado sobre o conceito A (saldo mantido)."));

  // principais mudanças
  pg.append(el("h3",null,"Principais mudanças no período"));
  const movers = [];
  for (const [cnpj,s] of Object.entries(D.bancos.series)) {
    if (s.length<2) continue;
    const a=s[s.length-2], b=s[s.length-1];
    if (String(b.data_base)!==String(LAST) || a.mantidos==null || b.mantidos==null) continue;
    movers.push({nome:(bancosUlt.find(x=>x.cnpj_raiz===cnpj)||{}).nome_curto||cnpj,
      de:a.mantidos,para:b.mantidos,delta:b.mantidos-a.mantidos,
      var:a.mantidos?b.mantidos/a.mantidos-1:null});
  }
  movers.sort((x,y)=>Math.abs(y.delta)-Math.abs(x.delta));
  pg.append(sortableTable([
    {k:"nome",label:"Instituição"},
    {k:"de",label:`Mantidos (mês anterior)`,num:1,fmt:rbi},
    {k:"para",label:`Mantidos (${mLabel(LAST)})`,num:1,fmt:rbi},
    {k:"delta",label:"Δ R$",num:1,fmt:rbi},{k:"var",label:"Δ %",num:1,fmt:v=>pct(v)},
  ], movers.slice(0,8), {sortK:"delta"}),
  el("p",{class:"note"},"O BRB não consta: sem dado publicado na última base (ausência ≠ variação). Saltos concentrados em fins de trimestre podem refletir crédito de remuneração ou reclassificações — investigar antes de interpretar como captação nova."));
}

function pageOnde(pg) {
  pg.append(el("h2",null,"Onde estão os recursos?"),
    el("p",{class:"lead"},"Distribuição por banco custodiante e mapa tribunal–banco. O mapa representa o tribunal contratante (origem institucional do depósito), não a localização física do dinheiro."));

  const ch = el("div",{class:"chart"});
  ch.append(el("div",{class:"title"},`Saldo mantido por instituição — treemap · ${mLabel(LAST)}`),
    el("div",{class:"subtitle"},"Área proporcional ao conceito A. BRB ausente da base (sem dado publicado)."),
    el("div",{class:"plot"}));
  pg.append(ch);
  const tdata = bancosUlt.filter(b=>String(b.data_base)===String(LAST)&&b.mantidos>1e8)
    .map(b=>({name:b.nome_curto,value:b.mantidos,
      itemStyle:{color:bankColor(b.cnpj_raiz),borderColor:cssVar("--surface"),borderWidth:2}}));
  const outros = bancosUlt.filter(b=>String(b.data_base)===String(LAST)&&b.mantidos<=1e8&&b.mantidos!=null)
    .reduce((s,b)=>s+b.mantidos,0);
  if (outros>0) tdata.push({name:"Demais (<R$ 0,1 bi)",value:outros,
    itemStyle:{color:cssVar("--muted"),borderColor:cssVar("--surface"),borderWidth:2}});
  const ttot = tdata.reduce((s,d)=>s+d.value,0);
  mkChart($(".plot",ch), () => ({
    tooltip:Object.assign(baseOpt().tooltip,{valueFormatter:rbi}),
    series:[{type:"treemap",roam:false,nodeClick:false,breadcrumb:{show:false},
      label:{color:"#fff",fontSize:12.5,
        formatter:p=>p.value/ttot>=0.02?`${p.name}\n${rbi(p.value)}`:""},
      itemStyle:{gapWidth:2},data:tdata}],
  }));

  pg.append(el("h3",null,"Matriz tribunal–banco"),
    el("p",{class:"note"},"Construída a partir de fontes públicas (tribunais, PNCP, diários oficiais, imprensa). Cada linha carrega fonte e status. Saldos por tribunal não são distribuídos por aproximação: o que não é publicado aparece como “não localizado”."));
  const f = el("div",{class:"filters"});
  const fUF = el("select"), fBanco = el("select"), fBusca = el("input",{placeholder:"Buscar tribunal ou banco…",type:"search"});
  fUF.append(el("option",{value:""},"UF: todas"));
  [...new Set(D.contratos.map(c=>{const t=D.tribunais.find(t=>t.sigla===c.tribunal_sigla);return t?t.uf:null}).filter(Boolean))].sort()
    .forEach(u=>fUF.append(el("option",{value:u},u)));
  fBanco.append(el("option",{value:""},"Banco: todos"));
  [...new Set(D.contratos.map(c=>c.banco_nome_curto))].sort().forEach(b=>fBanco.append(el("option",{value:b},b)));
  f.append(fUF,fBanco,fBusca); pg.append(f);
  const holder = el("div"); pg.append(holder);
  const cols = [
    {k:"tribunal_sigla",label:"Tribunal"},
    {k:"_uf",label:"UF"},{k:"_seg",label:"Segmento"},
    {k:"banco_nome_curto",label:"Banco"},
    {k:"papel",label:"Papel",html:r=>({estoque_legado:"estoque legado",novos_fluxos:"novos fluxos",ambos:"estoque + novos fluxos"}[r.papel]||r.papel)},
    {k:"data_inicio",label:"Início"},{k:"data_fim",label:"Fim"},
    {k:"saldo_informado",label:"Saldo informado",num:1,fmt:(v,r)=>v?`${rbi(v)} <span class="selo">(${r.saldo_data_base||"?"}, ${r.saldo_fonte||""})</span>`:"não localizado"},
    {k:"status",label:"Status",html:r=>{
      const map={confirmado_fonte_primaria:["ok","confirmado · fonte primária"],confirmado_imprensa:["warn","confirmado · imprensa"],parcial:["warn","parcial"],nao_localizado:["serious","não localizado"],conflitante:["critical","conflitante"]};
      const [cl,t]=map[r.status]||["",r.status];
      return `<span class="pill ${cl}">${t}</span>`;}},
    {k:"fonte_url",label:"Fonte",html:r=>r.fonte_url?`<a href="${r.fonte_url}" target="_blank" rel="noopener">documento</a>`:"—"},
  ];
  const enrich = D.contratos.map(c=>{const t=D.tribunais.find(t=>t.sigla===c.tribunal_sigla)||{};
    return Object.assign({_uf:t.uf,_seg:t.segmento},c)});
  const draw = () => {
    holder.innerHTML="";
    const q=(fBusca.value||"").toLowerCase();
    const rows = enrich.filter(r =>
      (!fUF.value||r._uf===fUF.value) && (!fBanco.value||r.banco_nome_curto===fBanco.value) &&
      (!q||JSON.stringify(r).toLowerCase().includes(q)));
    holder.append(sortableTable(cols,rows),csvButton("matriz_tribunal_banco.csv",cols,rows));
  };
  fUF.onchange=fBanco.onchange=draw; fBusca.oninput=draw; draw();

  pg.append(el("div",{class:"aviso"},
    `<b>Origem não identificada publicamente.</b> O BCB identifica o banco custodiante, mas não o tribunal de origem.
     A soma dos saldos por tribunal publicados cobre apenas parte do estoque de cada banco; a diferença permanece como
     “origem não identificada publicamente” — nunca é distribuída por aproximação. Exemplo: dos ~${rbi((brbLast||{}).estoque_ampliado)} administrados pelo BRB (${mLabel((brbLast||{}).data_base)}),
     a imprensa e o CNJ atribuem ~R$ 30 bi a cinco tribunais (TJDFT, TJBA, TJAL, TJPB, TJMA), com saldos individuais parcialmente divulgados.`));

  pg.append(el("h3",null,"Estoque legado × novos fluxos"),
    el("p",{class:"note"},"Quando um tribunal troca de banco, o estoque antigo pode permanecer no banco anterior enquanto os novos depósitos vão para o novo contratado. Casos identificados:"));
  const casos = D.contratos.filter(c=>c.papel==="estoque_legado"||c.papel==="novos_fluxos");
  pg.append(sortableTable([
    {k:"tribunal_sigla",label:"Tribunal"},{k:"banco_nome_curto",label:"Banco"},
    {k:"papel",label:"Papel",html:r=>r.papel==="estoque_legado"?"🏛 estoque legado":"→ novos fluxos"},
    {k:"instrumento",label:"Instrumento"},{k:"fonte_url",label:"Fonte",html:r=>`<a href="${r.fonte_url}" target="_blank" rel="noopener">fonte</a>`},
  ],casos));
}

function pageBancos(pg) {
  pg.append(el("h2",null,"Bancos e exposição"),
    el("p",{class:"lead"},"Indicadores de escala e concentração por instituição. A relação com captação ou patrimônio mede dependência e escala — não é estimativa de perda."));

  const rows = bancosUlt.map(b=>Object.assign({},b,{_defasado:b.defasado?`⚠ ${mLabel(b.data_base)}`:mLabel(b.data_base)}));
  const cols = [
    {k:"nome_curto",label:"Instituição",html:r=>`<b>${r.nome_curto||r.nome_instituicao}</b><br><span class="selo">${(r.tipo_controle||"").replace("_"," ")}</span>`},
    {k:"_defasado",label:"Data-base"},
    {k:"mantidos",label:"Mantidos",num:1,fmt:rbi},
    {k:"estoque_ampliado",label:"Ampliado (A+B)",num:1,fmt:rbi},
    {k:"mantidos_sobre_ativos",label:"/ ativos",num:1,fmt:v=>pct(v)},
    {k:"mantidos_sobre_captacao",label:"/ captação*",num:1,fmt:v=>pct(v)},
    {k:"mantidos_sobre_depositos",label:"/ depósitos",num:1,fmt:v=>pct(v)},
    {k:"ampliado_sobre_pl",label:"Ampliado / PL",num:1,fmt:rx},
    {k:"cresc_12m",label:"Δ12m mantidos",num:1,fmt:v=>pct(v)},
  ];
  pg.append(sortableTable(cols,rows,{sortK:"mantidos"}),
    el("p",{class:"note"},"*Captação proxy = depósitos + operações compromissadas + outros instrumentos de dívida + empréstimos e repasses (doc. 4010). ⚠ = dado defasado (instituição ausente da última base; valores na última data disponível da própria instituição — não comparável em data com as demais). Classificação por porte: use os ativos totais na tabela; segmento prudencial S1 confirmado para BB, Caixa, Itaú, Bradesco e Santander; demais “a confirmar” (IF.data)."));

  // gráfico de razões
  const ch = el("div",{class:"chart"});
  ch.append(el("div",{class:"title"},"Dependência de funding — mantidos / captação proxy"),
    el("div",{class:"subtitle"},"Instituições com saldo mantido > R$ 1 bi. Linha pontilhada: limiar de red flag (20%). BRB em nov/2025 (dado defasado)."),
    el("div",{class:"plot short"}));
  pg.append(ch);
  const rr = rows.filter(r=>r.mantidos>1e9 && r.mantidos_sobre_captacao!=null)
    .sort((a,b)=>a.mantidos_sobre_captacao-b.mantidos_sobre_captacao);
  mkChart($(".plot",ch), () => ({
    xAxis:Object.assign(axCommon(),{type:"value",axisLabel:{formatter:v=>pct(v,0),color:cssVar("--muted")},max:.35}),
    yAxis:Object.assign(axCommon(),{type:"category",data:rr.map(r=>r.nome_curto),splitLine:{show:false}}),
    tooltip:Object.assign(baseOpt().tooltip,{valueFormatter:v=>pct(v)}),
    series:[{type:"bar",barMaxWidth:18,
      itemStyle:{borderRadius:[0,4,4,0],color:p=>bankColor(rr[p.dataIndex].cnpj_raiz)},
      label:{show:true,position:"right",color:cssVar("--ink2"),fontSize:11.5,formatter:p=>pct(p.value)},
      data:rr.map(r=>r.mantidos_sobre_captacao),
      markLine:{symbol:"none",lineStyle:{color:cssVar("--serious"),type:"dashed",width:1},
        label:{formatter:"limiar 20%",color:cssVar("--serious"),fontSize:11},data:[{xAxis:.20}]}}],
  }));

  pg.append(el("h3",null,"Red flags ativas"),
    el("p",{class:"note"},"<b>Red flag é sinal para investigação e não prova de irregularidade.</b> Cada sinal traz regra, valor, limiar, fonte e data."));
  D.redflags.forEach(f => {
    const sev = f.materialidade==="alta"?"critical":"serious";
    const div = el("div",{class:"flag"},
      `<b>${f.nome_instituicao}</b> — <span class="pill ${sev==="critical"?"critical":"serious"}">${f.regra}</span><br>
       ${f.explicacao}<br>
       <span class="src">Valor observado: ${f.valor_observado==null?"—":(f.regra.includes("sobre")?pct(f.valor_observado):f.valor_observado)} ·
       Limiar: ${f.limiar==null?"—":(f.limiar<1?pct(f.limiar,0):f.limiar+"×")} · Data-base: ${mLabel(f.data_base)} ·
       Materialidade: ${f.materialidade} · Fonte: ${f.fonte} · Status: ${f.status_apuracao.replace(/_/g," ")}</span>`);
    if (f.materialidade!=="alta") div.style.borderLeftColor = cssVar("--warn");
    pg.append(div);
  });
}

function pageBRB(pg) {
  pg.append(el("h2",null,"Dossiê BRB — Banco de Brasília"),
    el("p",{class:"lead"},"Página factual, sem presunção de irregularidade. CNPJ 00.000.208/0001-00 · controlado pelo Governo do Distrito Federal."));

  pg.append(el("div",{class:"aviso"},
    `<b>Dado defasado.</b> O BRB está ausente dos balancetes públicos do BCB desde dez/2025 (também ausente em out/2025; última base publicada: <b>nov/2025</b>).
     O banco confirmou que não divulgaria o balanço de 2025 no prazo legal (31/03/2026) e, até ago/2026, segue sem publicar as demonstrações de 3T25 em diante.
     A razão da ausência nos balancetes não foi explicada oficialmente por BCB ou BRB (não confirmado em fonte primária). Todos os indicadores abaixo usam a última data disponível de cada fonte, sempre indicada.`));

  if (brbLast) {
    const cards = el("div",{class:"cards"});
    const add=(l,v,m)=>{const c=el("div",{class:"card small"});
      c.append(el("div",{class:"label"},l),el("div",{class:"value"},v),el("div",{class:"meta"},m));cards.append(c);};
    add("Mantidos no banco",rbi(brbLast.mantidos),`${mLabel(brbLast.data_base)} · conta 4.1.5.50`);
    add("Repassados a estados/DF",rbi(brbLast.rep_estados_df),`${mLabel(brbLast.data_base)} · conta 9.0.9.08`);
    add("Repassados a municípios",rbi(brbLast.rep_municipios),`${mLabel(brbLast.data_base)} · conta 9.0.9.09`);
    add("Estoque ampliado",rbi(brbLast.estoque_ampliado),`${mLabel(brbLast.data_base)} · A+B`);
    add("Mantidos / captação",pct(brbLast.mantidos_sobre_captacao),`${mLabel(brbLast.data_base)} · limiar red flag: 20%`);
    add("Ampliado / PL",rx(brbLast.ampliado_sobre_pl),`PL ${rbi(brbLast.patrimonio_liquido)} · medida de escala, não perda`);
    pg.append(cards);

    // participação de mercado
    const nacNov = serieNac.find(r=>String(r.data_base)==="202511");
    if (nacNov) pg.append(el("p",{class:"note"},
      `Participação nacional em nov/2025 (última base com BRB): ${pct(brbLast.mantidos/nacNov.mantidos_total)} do saldo mantido do segmento; ` +
      `${pct(brbLast.estoque_ampliado/nacNov.estoque_ampliado)} do estoque ampliado.`));

    const ch = el("div",{class:"chart"});
    ch.append(el("div",{class:"title"},"Decomposição — mantido × repassado (R$ bi)"),
      el("div",{class:"subtitle"},"jun/2025: soma ≈ R$ 25,6 bi — consistente com a divulgação de uma “carteira de ~R$ 25 bi” (divulgação não localizada em fonte primária). set/2025: ≈ R$ 29,9 bi."),
      el("div",{class:"plot"}));
    pg.append(ch);
    mkChart($(".plot",ch), () => ({
      color:[cssVar("--s3"),cssVar("--s2"),cssVar("--s4")],
      legend:{top:0,textStyle:{color:cssVar("--ink2"),fontSize:12}},
      xAxis:Object.assign(axCommon(),{type:"category",data:BRB.map(r=>mLabel(r.data_base)),splitLine:{show:false}}),
      yAxis:Object.assign(axCommon(),{type:"value",axisLabel:{formatter:v=>(v/1e9).toLocaleString("pt-BR"),color:cssVar("--muted")}}),
      tooltip:Object.assign(baseOpt().tooltip,{trigger:"axis",valueFormatter:rbi}),
      series:[
        {name:"Mantidos na instituição",type:"bar",stack:"s",barMaxWidth:24,itemStyle:{borderColor:cssVar("--surface"),borderWidth:2},data:BRB.map(r=>r.mantidos)},
        {name:"Repassados a estados/DF",type:"bar",stack:"s",barMaxWidth:24,itemStyle:{borderColor:cssVar("--surface"),borderWidth:2},data:BRB.map(r=>r.rep_estados_df)},
        {name:"Repassados a municípios",type:"bar",stack:"s",barMaxWidth:24,itemStyle:{borderRadius:[4,4,0,0],borderColor:cssVar("--surface"),borderWidth:2},data:BRB.map(r=>r.rep_municipios)},
      ]}));
  }

  pg.append(el("h3",null,"Contratos com tribunais"));
  const cbrb = D.contratos.filter(c=>c.banco_nome_curto==="BRB");
  pg.append(sortableTable([
    {k:"tribunal_sigla",label:"Tribunal"},{k:"instrumento",label:"Instrumento"},
    {k:"data_inicio",label:"Início"},{k:"data_fim",label:"Fim"},
    {k:"saldo_informado",label:"Saldo informado",num:1,fmt:(v,r)=>v?`${rbi(v)} <span class="selo">(${r.saldo_data_base||""})</span>`:"não localizado"},
    {k:"contraprestacao_condicoes",label:"Condições / contraprestação"},
    {k:"status",label:"Status",html:r=>`<span class="pill ${r.status==="confirmado_fonte_primaria"?"ok":"warn"}">${r.status.replace(/_/g," ")}</span>`},
    {k:"fonte_url",label:"Fonte",html:r=>`<a href="${r.fonte_url}" target="_blank" rel="noopener">fonte</a>`},
  ],cbrb));
  pg.append(el("p",{class:"note"},
    "Mudança relevante: desde 15/05/2026 os novos depósitos do TJDFT vão para a Caixa (contrato-ponte de 6 meses); o estoque de ~R$ 8,4 bi permanece no BRB, além de contas já vinculadas e precatórios do GDF (fonte primária: TJDFT). Não foi localizado valor de contraprestação paga pelo BRB a nenhum tribunal em fonte primária."));

  pg.append(el("h3",null,"Indicadores financeiros públicos mais recentes"),
    el("p",{class:"note"},
    "Últimos divulgados pelo banco (1S25, em 29/08/2025): lucro recorrente R$ 518 mi; ativos R$ 74,5 bi; PL R$ 4,0 bi; Basileia 13,91%. " +
    "Dado primário BCB (doc. 4010, individual, não auditado): PL de R$ 4,11 bi (set/2025) e R$ 3,77 bi (nov/2025). " +
    "Não há opinião pública do auditor independente (Grant Thornton, contratada em jun/2025 no lugar da EY) sobre o exercício de 2025 — o balanço não foi publicado. " +
    "Multas diárias por atraso (CVM/BCB) correm desde 01/04/2026; imprensa estima ~R$ 3 mi acumulados (valor oficial não localizado)."));

  pg.append(el("h3",null,"Linha do tempo — contratos, carteira e eventos financeiros"));
  const tl = el("ul",{class:"timeline"});
  D.eventos.slice().sort((a,b)=>a.data.localeCompare(b.data)).forEach(e => {
    tl.append(el("li",null,
      `<div class="d">${e.data} · ${e.categoria.replace(/_/g," ")}</div>
       <div class="t">${e.evento}</div>
       <div class="s"><a href="${e.fonte_url}" target="_blank" rel="noopener">${e.tipo_fonte}</a> · ${e.status.replace(/_/g," ")}</div>`));
  });
  pg.append(tl);
}

function pageContratos(pg) {
  pg.append(el("h2",null,"Contratos tribunal–banco"),
    el("p",{class:"lead"},"Instrumentos identificados em fontes públicas, com vigência, condições e documento de origem. Contraprestações raramente são divulgadas — lacuna estrutural de transparência."));
  const cols = [
    {k:"tribunal_sigla",label:"Tribunal"},{k:"banco_nome_curto",label:"Banco"},
    {k:"instrumento",label:"Instrumento"},
    {k:"data_inicio",label:"Início"},{k:"data_fim",label:"Fim"},
    {k:"exclusividade",label:"Exclusividade"},
    {k:"tipos_valores",label:"Valores abrangidos"},
    {k:"contraprestacao_condicoes",label:"Contraprestação / condições"},
    {k:"status",label:"Status",html:r=>{
      const map={confirmado_fonte_primaria:["ok","confirmado · fonte primária"],confirmado_imprensa:["warn","confirmado · imprensa"],parcial:["warn","parcial"],nao_localizado:["serious","não localizado"]};
      const [cl,t]=map[r.status]||["",r.status];return `<span class="pill ${cl}">${t}</span>`;}},
    {k:"fonte_url",label:"Documento",html:r=>`<a href="${r.fonte_url}" target="_blank" rel="noopener">abrir</a>`},
  ];
  pg.append(sortableTable(cols,D.contratos),csvButton("contratos_tribunal_banco.csv",cols,D.contratos));

  pg.append(el("h3",null,"Contratos a vencer ou recém-alterados"));
  const alerts = [
    "TJPA–Banpará: vigência atual até 27/11/2026 (Apostilamento nº 065/2025).",
    "TJDFT–Caixa: contrato-ponte de 6 meses (até ~nov/2026), novo credenciamento em preparação.",
    "TJDFT–BRB: encerrado em 14/05/2026 — estoque legado permanece no BRB até exaurimento.",
    "TJMA–BRB: contrato nº 85/2025 sob questionamento na Corregedoria Nacional de Justiça (fev/2026).",
  ];
  const ul = el("ul"); alerts.forEach(a=>ul.append(el("li",{class:"note"},a))); pg.append(ul);
}

function pageFiscal(pg) {
  pg.append(el("h2",null,"Uso fiscal e fundos de reserva"),
    el("p",{class:"lead"},"Valores repassados aos entes públicos (uso fiscal autorizado por lei) e o que se sabe — e não se sabe — sobre os fundos de reserva que garantem a restituição."));

  const cards = el("div",{class:"cards"});
  [["União",nacUlt.rep_uniao,"Lei 9.703/1998 + Lei 14.973/2024 · conta 9.0.9.07 · concentrado na Caixa (agente arrecadador)"],
   ["Estados e DF",nacUlt.rep_estados_df,"LC 151/2015 + leis estaduais · conta 9.0.9.08"],
   ["Municípios",nacUlt.rep_municipios,"LC 151/2015 · conta 9.0.9.09"]]
   .forEach(([l,v,m])=>{const c=el("div",{class:"card"});
     c.append(el("div",{class:"label"},`Repassado — ${l}`),
       el("div",{class:"value"},`${bi(v)} <small>R$ bi</small>`),el("div",{class:"meta"},`${mLabel(LAST)} · ${m}`));
     cards.append(c);});
  pg.append(cards);

  const ch = el("div",{class:"chart"});
  ch.append(el("div",{class:"title"},"Evolução dos valores repassados, por ente (R$ bi)"),
    el("div",{class:"subtitle"},"Contas de controle da classe 9 do custodiante — registram a obrigação potencial de restituição dos entes."),
    el("div",{class:"plot"}));
  pg.append(ch);
  mkChart($(".plot",ch), () => ({
    color:[cssVar("--s1"),cssVar("--s2"),cssVar("--s3")],
    legend:{top:0,textStyle:{color:cssVar("--ink2"),fontSize:12}},
    xAxis:Object.assign(axCommon(),{type:"category",data:serieNac.map(r=>mLabel(r.data_base)),splitLine:{show:false}}),
    yAxis:Object.assign(axCommon(),{type:"value",axisLabel:{formatter:v=>(v/1e9).toLocaleString("pt-BR"),color:cssVar("--muted")}}),
    tooltip:Object.assign(baseOpt().tooltip,{trigger:"axis",valueFormatter:rbi}),
    series:[
      {name:"União",type:"bar",stack:"s",barMaxWidth:24,itemStyle:{borderColor:cssVar("--surface"),borderWidth:2},data:serieNac.map(r=>r.rep_uniao)},
      {name:"Estados e DF",type:"bar",stack:"s",barMaxWidth:24,itemStyle:{borderColor:cssVar("--surface"),borderWidth:2},data:serieNac.map(r=>r.rep_estados_df)},
      {name:"Municípios",type:"bar",stack:"s",barMaxWidth:24,itemStyle:{borderRadius:[4,4,0,0],borderColor:cssVar("--surface"),borderWidth:2},data:serieNac.map(r=>r.rep_municipios)},
    ]}));

  pg.append(el("h3",null,"Quem repassou a quem — por banco custodiante"),
    el("p",{class:"note"},`Registros da classe 9 na última data-base de cada instituição.`));
  const rows = bancosUlt.filter(b=>b.rep_uniao||b.rep_estados_df||b.rep_municipios)
    .map(b=>({nome:b.nome_curto,db:mLabel(b.data_base)+(b.defasado?" ⚠":""),u:b.rep_uniao,e:b.rep_estados_df,m:b.rep_municipios}));
  pg.append(sortableTable([
    {k:"nome",label:"Instituição"},{k:"db",label:"Data-base"},
    {k:"u",label:"→ União",num:1,fmt:rbi},{k:"e",label:"→ Estados/DF",num:1,fmt:rbi},{k:"m",label:"→ Municípios",num:1,fmt:rbi},
  ],rows,{sortK:"u"}));

  pg.append(el("h3",null,"Fundos de reserva"),
    el("div",{class:"aviso"},
    `<b>Não disponível na fonte contábil pública.</b> A LC 151/2015 exige fundo de reserva de 30% sobre os depósitos tributários transferidos
     a estados e municípios, recomposto em 48h quando insuficiente. O balancete público (doc. 4010) <b>não evidencia</b> uma conta específica
     de fundo de reserva neste nível de detalhe. Saldos de fundos de reserva devem ser buscados nas demonstrações dos bancos, nos relatórios
     dos tribunais e via Lei de Acesso à Informação — modelos de pedido prontos em <code>docs/06_modelos_LAI.md</code>.
     Nenhum valor de fundo de reserva é estimado neste painel.`),
    el("h3",null,"Obrigação de restituição"),
    el("p",{class:"note"},
    "Se o depositante vence a ação, o valor deve ser restituído: quando o recurso foi repassado ao ente público, a obrigação de restituição é do ente " +
    "(via fundo de reserva e, se insuficiente, recomposição com recursos próprios — LC 151/2015, art. 3º; Lei 14.973/2024 para a União). " +
    "Quando o recurso está mantido no banco, a obrigação operacional é da instituição custodiante. Os indicadores fiscais de cada ente " +
    "(capacidade de recomposição) são uma extensão prevista no roadmap — não constam desta versão."));
}

function pageEventos(pg) {
  pg.append(el("h2",null,"Eventos e monitoramento"),
    el("p",{class:"lead"},"Mudanças contratuais, decisões, manifestações de reguladores e fatos confirmados — cada item com fonte e status."));
  const f = el("div",{class:"filters"});
  const fc = el("select"); fc.append(el("option",{value:""},"Categoria: todas"));
  [...new Set(D.eventos.map(e=>e.categoria))].sort().forEach(c=>fc.append(el("option",{value:c},c.replace(/_/g," "))));
  f.append(fc); pg.append(f);
  const holder = el("div"); pg.append(holder);
  const draw = () => {
    holder.innerHTML="";
    const tl = el("ul",{class:"timeline"});
    D.eventos.filter(e=>!fc.value||e.categoria===fc.value)
      .sort((a,b)=>b.data.localeCompare(a.data))
      .forEach(e => tl.append(el("li",null,
        `<div class="d">${e.data} · ${e.categoria.replace(/_/g," ")} · ${e.entidade}</div>
         <div class="t">${e.evento}</div>
         <div class="s"><a href="${e.fonte_url}" target="_blank" rel="noopener">fonte (${e.tipo_fonte})</a> ·
         <span class="pill ${e.status==="confirmado"?"ok":"warn"}">${e.status.replace(/_/g," ")}</span></div>`)));
    holder.append(tl);
  };
  fc.onchange = draw; draw();
  pg.append(el("p",{class:"note"},"Notícias só entram quando confirmadas; relatos exclusivamente de imprensa são marcados como “confirmado imprensa”. Fatos não confirmados em nenhuma fonte confiável não entram."));
}

function pageMetodo(pg) {
  pg.append(el("h2",null,"Metodologia e auditoria"),
    el("p",{class:"lead"},"Conceitos, contas, fórmulas, fontes, limitações e todos os testes executados. Documentação completa no diretório <code>docs/</code> do repositório."));

  pg.append(el("h3",null,"O que é um depósito judicial — em 60 segundos"));
  pg.append(el("dl",{class:"defs"},`
    <dt>O que é</dt><dd>Valor entregue em juízo (garantia, discussão de dívida, consignação) e mantido sob administração de uma instituição financeira contratada ou designada por lei, até decisão judicial.</dd>
    <dt>De quem é o dinheiro</dt><dd>Da parte que tiver razão ao final do processo — nunca do banco. No banco, aparece como passivo (obrigação de devolver) e funciona como funding enquanto mantido.</dd>
    <dt>Quem movimenta</dt><dd>Somente por ordem judicial (alvará). O banco custodia e remunera; o tribunal gere as contas; o ente público pode receber repasses autorizados por lei.</dd>
    <dt>Remuneração</dt><dd>Em regra, equivalente à da poupança ou TR+juros conforme a esfera e a lei aplicável. Nos federais, historicamente Selic (Lei 9.703/1998, revogada); desde a Lei 14.973/2024 (operacionalizada pela Portaria MF 1.430/2025, efeitos a partir de 2026), correção por índice de inflação — mudança questionada no STF (ADI 7.905, pendente).</dd>
    <dt>Se o depositante vence</dt><dd>Levanta o valor com remuneração. Se o recurso foi repassado ao ente público, quem restitui é o ente (fundo de reserva; recomposição em 48h se insuficiente — LC 151/2015).</dd>
    <dt>Papéis</dt><dd>Banco custodiante/depositário (guarda e remunera) ≠ tribunal gestor (administra contas e autoriza) ≠ ente beneficiário (recebe repasses e assume obrigação de restituir).</dd>
    <dt>Garantias em crise do banco</dt><dd>Depósitos judiciais <b>não são cobertos</b> pela garantia ordinária do FGC — exclusão expressa no Regulamento (Res. CMN 4.222/2013, Anexo II, art. 2º, §1º, III; confirmado em fonte primária). Em liquidação do custodiante aplica-se a Lei 6.024/1974; o STJ já decidiu que a liquidação não autoriza o banco a levantar valores depositados judicialmente. A classificação do depositante no concurso de credores permanece controvertida — ver docs/03_marco_legal.md.</dd>`));
  const fluxo = el("div",{class:"fluxo"});
  ["Depósito realizado","mantido na instituição OU repassado ao ente público","decisão judicial","levantamento pela parte, conversão em receita OU restituição"]
    .forEach((s,i)=>{ if(i) fluxo.append(el("span",{class:"arr"},"→")); fluxo.append(el("span",{class:"step"},s)); });
  pg.append(fluxo);

  pg.append(el("h3",null,"Contas Cosif utilizadas"));
  const contas = [
    ["4.1.5.50.00.00-9","Depósitos judiciais e administrativos mantidos na instituição","Conceito A — passivo do banco"],
    ["9.0.9.07","Repassados à União","Conceito B — controle (classe 9)"],
    ["9.0.9.08","Repassados a estados e DF","Conceito B — controle (classe 9)"],
    ["9.0.9.09","Repassados a municípios","Conceito B — controle (classe 9)"],
    ["3.0.9.07/08/09","Espelho na compensação ativa","NUNCA somado (dupla contagem)"],
    ["8.1.1.40","(-) Despesas de dep. judiciais mantidos","Custo de remuneração (semestral)"],
    ["1.8.9.97/98","Provisões sobre direitos de restituição","Contexto — não somado"],
  ].map(([c,n,u])=>({c,n,u}));
  pg.append(sortableTable([{k:"c",label:"Conta"},{k:"n",label:"Nome"},{k:"u",label:"Uso no painel"}],contas));

  pg.append(el("h3",null,"Regras anti-dupla-contagem"));
  const regras = el("ul");
  ["Somente documento 4010 (entidade legal, CNPJ individual); o 4016 (conglomerado prudencial), presente em jun/dez, é descartado — nunca somado.",
   "Somente contas de controle da classe 9 para repasses; o espelho da classe 3 é usado apenas como teste de consistência.",
   "Banco individual nunca é misturado com conglomerado.",
   "Ausência de instituição = “não disponível”; nenhum valor antigo é somado a uma data-base mais nova.",
   "A série começa em jan/2025: antes disso o balancete público não revela a rubrica neste detalhe (mudança do Cosif — Res. CMN 4.966). Não construímos série anterior por interpolação; backfill previsto via demonstrações financeiras e LAI.",
  ].forEach(r=>regras.append(el("li",{class:"note"},r)));
  pg.append(regras);

  pg.append(el("h3",null,"Testes de qualidade da execução atual"),
    el("p",{class:"note"},`Resultado geral: <b>${D.quality.resultado_geral}</b> · executado em ${D.quality.executado_em_utc}. Pontos de controle reproduzidos manualmente nos arquivos oficiais antes da automação; falha em qualquer ponto invalida a execução.`));
  pg.append(sortableTable([
    {k:"check",label:"Teste"},{k:"resultado",label:"Resultado",html:r=>`<span class="pill ${r.resultado==="PASSOU"?"ok":"critical"}">${r.resultado}</span>`},
    {k:"detalhe",label:"Detalhe"}],D.quality.checks));

  pg.append(el("h3",null,"Fontes coletadas (registro completo)"));
  pg.append(sortableTable([
    {k:"source_id",label:"ID"},{k:"data_base",label:"Data-base"},
    {k:"status",label:"Status",html:r=>`<span class="pill ${r.status==="ok"?"ok":"warn"}">${r.status}</span>`},
    {k:"url",label:"URL",html:r=>r.url?`<a href="${r.url}" target="_blank" rel="noopener">arquivo</a>`:"—"},
    {k:"data_download_utc",label:"Download (UTC)"},
    {k:"sha256",label:"SHA-256",html:r=>r.sha256?`<code>${r.sha256.slice(0,16)}…</code>`:"—"}],D.fontes));

  pg.append(el("h3",null,"Selos de validação usados no painel"));
  const selos = el("ul");
  [["confirmado · fonte primária","documento oficial do próprio órgão (tribunal, BCB, PNCP, diário oficial)"],
   ["confirmado · imprensa","fato relatado por veículos confiáveis, sem documento primário localizado"],
   ["parcial","parte da informação confirmada; lacunas indicadas"],
   ["cálculo derivado","número calculado a partir de fontes primárias (fórmula exibida)"],
   ["não localizado / não disponível","a informação não existe publicamente ou não foi encontrada — nunca é estimada"],
   ["dado defasado","última data disponível da fonte é anterior à data-base do painel"],
  ].forEach(([s,d])=>selos.append(el("li",{class:"note"},`<b>${s}</b> — ${d}`)));
  pg.append(selos);

  pg.append(el("h3",null,"Limitações conhecidas"));
  const lim = el("ul");
  ["O agregado não separa depósitos judiciais de administrativos (limite da fonte).",
   "Não separa tributários de não tributários, nem recursais trabalhistas, fianças e cauções (limite do plano de contas público).",
   "Fundos de reserva não são evidenciados no balancete público.",
   "O BCB não identifica o tribunal de origem — a matriz tribunal–banco vem de fontes documentais e é inerentemente incompleta.",
   "Cobertura restrita ao segmento Bancos (cooperativas e outros segmentos fora).",
   "Precatórios e RPVs não são depósitos judiciais e não estão nos totais (aparecem apenas nos contratos que os abrangem).",
  ].forEach(x=>lim.append(el("li",{class:"note"},x)));
  pg.append(lim);

  pg.append(el("h3",null,"Downloads auditáveis"),
    el("p",{class:"note"},`No repositório: <code>data/exports/observatorio_depositos_judiciais.xlsx</code> (Excel completo),
     <code>data/exports/*.csv</code> (marts), <code>data/raw/bcb_balancetes/</code> (arquivos brutos com hash),
     <code>docs/</code> (metodologia, marco legal, dicionário de conceitos, lacunas, modelos de LAI, roadmap).`));
}

// ---------- bootstrap ----------
$("#hd-database").textContent = `última data-base: ${mLabel(LAST)}`;
$("#ft-gen").textContent = `Gerado em ${D.meta.gerado_em_utc} · qualidade: ${D.meta.resultado_qualidade}`;
const tabs = $("#tabs"), main = $("#main");
const RENDER = {nacional:pageNacional, onde:pageOnde, bancos:pageBancos, brb:pageBRB,
  contratos:pageContratos, fiscal:pageFiscal, eventos:pageEventos, metodo:pageMetodo};
PAGES.forEach(([id,label]) => {
  const b = el("button",{role:"tab","aria-selected":"false","data-id":id},label);
  b.onclick = () => activate(id);
  tabs.append(b);
  const sec = el("section",{class:"page",id:`page-${id}`});
  main.append(sec);
});
function activate(id) {
  tabs.querySelectorAll("button").forEach(b=>b.setAttribute("aria-selected", b.dataset.id===id ? "true":"false"));
  main.querySelectorAll("section.page").forEach(s=>s.classList.remove("active"));
  const sec = $(`#page-${id}`);
  if (!sec.dataset.rendered) { RENDER[id](sec); sec.dataset.rendered = "1"; }
  sec.classList.add("active");
  charts.forEach(x=>x.c.resize());
  location.hash = id;
}
activate(location.hash.replace("#","") || "nacional");
})();
