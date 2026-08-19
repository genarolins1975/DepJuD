# Desenho pré-implementação (fase de aprovação lógica)

Documento exigido pela ordem de execução do projeto: conceitos medidos, contas Cosif, riscos de dupla contagem, fontes, lacunas, desenho das tabelas e wireframe textual — apresentados **antes** do código definitivo e validados pelos pontos de controle da fase 1.

## 1. Conceitos medidos

Três números nacionais distintos (nunca um único agregado): **A** saldo mantido nos bancos (conta 4.1.5.50); **B** saldo repassado aos entes (9.0.9.07/08/09, separado por União, estados/DF e municípios); **C** estoque ampliado = A + B (com a ressalva de linguagem: não é "dinheiro nos bancos"). Definições completas: `02_dicionario_conceitos.md`.

## 2. Contas Cosif utilizadas

Ver tabela em `04_metodologia_auditoria.md` §1. Núcleo: `4155000009`, `9090700005`, `9090800008`, `9090900001`; espelhos da classe 3 apenas para teste; estruturais (ativo, depósitos, captação, PL) para indicadores.

## 3. Riscos de dupla contagem identificados e mitigação

| Risco | Mecanismo | Mitigação implementada |
|---|---|---|
| Documento 4010 × 4016 (jun/dez) | O arquivo mensal traz balancete individual E conglomerado prudencial | Filtro estrito `DOCUMENTO=4010` + teste `anti_dupla_contagem_4016` |
| Classe 3 × classe 9 | Contas espelho de compensação (3.0.9.0x = 9.0.9.0x) | Somar somente classe 9 + teste de igualdade dos espelhos |
| A × B | Somar mantidos com repassados sem distinguir conceitos | Conceitos A e B sempre separados; C explicitamente derivado |
| Banco × conglomerado | Misturar CNPJs de entidades do mesmo grupo | Entidade legal individual (CNPJ raiz) sempre |
| Datas distintas | Somar o BRB de nov/2025 ao total de mar/2026 | Ausência = exclusão da soma + aviso destacado com último valor e data |
| Precatórios/RPV × depósitos | Contratos abrangem ambos | Precatórios nunca entram nos totais; só descritos em contratos |
| Balancete × DF do banco | Escopos diferentes (individual × consolidado) | Reconciliações documentadas com explicação de diferenças |

## 4. Fontes disponíveis

1. **BCB — Balancetes doc. 4010** (primária, mensal, jan/2025→) — núcleo quantitativo.
2. Tribunais (notícias oficiais, portais de transparência), **PNCP**, diários oficiais — contratos.
3. **CNJ** (Recomendação 147/2023; intimações de 2026), CJF, CSJT.
4. DFs e RI dos bancos (BRB 1S25; demais atualizadas).
5. Legislação e jurisprudência (Planalto, STF, STJ, BCB/CMN).
6. Imprensa confiável — somente com selo `confirmado_imprensa`.

## 5. Lacunas

Ver `01_diagnostico_disponibilidade.md` e `05_relatorio_lacunas.md`. As cinco de prioridade alta: balancetes BRB pós-nov/2025; fundos de reserva; contraprestações; saldo por tribunal; condições dos contratos BRB.

## 6. Desenho das tabelas (modelo de dados)

```
dim_banco            (cnpj_raiz PK, nome_curto, nome, tipo_controle, uf_sede,
                      segmento_prudencial, segmento_status, observacao)
dim_tribunal         (sigla PK, nome, codigo_cnj, segmento, uf)
dim_ente_publico     (ente_id PK, nome, esfera, conta_cosif_repasse, marco_legal, obs)
fact_saldo_bcb       (data_base, cnpj_raiz, conta, saldo, arquivo, linha_arquivo,
                      sha256_arquivo, fonte)          -- grão: banco × mês × conta
fact_valor_repassado (data_base, cnpj_raiz, ente_destino, conta, saldo, rastreio…)
fact_indicador_bancario (data_base, cnpj_raiz, mantidos, rep_*, estoque_ampliado,
                      ativo_total, depositos_totais, captacao_proxy, pl, razões…)
fact_crescimento     (cnpj_raiz, data_base, cresc_3m, cresc_12m)
fact_contrato        (tribunal_sigla FK, cnpj_raiz FK, papel, instrumento, datas,
                      exclusividade, tipos_valores, contraprestacao, saldo_informado,
                      saldo_data_base, fonte_url, data_fonte, status)
fact_saldo_tribunal  (tribunal_sigla, cnpj_raiz, saldo, data_base, conceito, fonte, status)
fact_evento          (data, categoria, entidade, evento, fonte_url, tipo_fonte, status)
source_registry      (source_id PK, tipo, url, arquivo_local, data_base,
                      data_download_utc, tamanho, sha256, status)
quality_issues       (check, severidade, detalhe)
mart_nacional        (data_base, A, B por ente, C, n_instituicoes, CR1/2/5, HHI)
mart_instituicoes_ausentes / mart_red_flags
```
Fluxo: `raw/` (zips + hash) → `staging/` (Parquet) → `marts/` (CSV) → `exports/` (CSV+XLSX) e `site/data/` (JSON). Motor: Python + DuckDB.

## 7. Wireframe textual das 8 páginas

**P1 Visão Nacional** — 3 cartões-herói (A, B, C) com data-base, conceito e botão "Como este número foi calculado?"; aviso de cobertura/ausências (BRB); linha do tempo dos 3 conceitos; ranking por banco (data e visão nominal/% selecionáveis, rótulos diretos); cartões CR1/CR2/CR5/HHI; tabela de principais mudanças m/m.

**P2 Onde estão os recursos?** — treemap por banco; matriz tribunal–banco (filtros UF/banco + busca, selos de status, link para documento, export CSV); aviso "origem não identificada publicamente"; tabela estoque legado × novos fluxos.

**P3 Bancos e exposição** — tabela ordenável (mantidos, ampliado, /ativos, /captação, /depósitos, ampliado/PL, Δ12m, data-base com marcador de defasagem); gráfico de dependência de funding com limiar de red flag; lista de red flags com regra/valor/limiar/fonte/data/materialidade/status.

**P4 Dossiê BRB** — aviso de dado defasado; 6 cartões (mantidos, repasses, ampliado, razões); participação de mercado em nov/2025; decomposição mantido × repassado (barras empilhadas, reconciliação 25,6/29,9 bi); contratos com tribunais; indicadores financeiros mais recentes com datas; linha do tempo completa.

**P5 Contratos** — tabela completa com instrumento, vigência, exclusividade, valores abrangidos, contraprestação, status e documento; lista de contratos a vencer/alterados.

**P6 Uso fiscal e fundos de reserva** — cartões por ente; barras empilhadas da evolução dos repasses; tabela por banco custodiante; seção fundos de reserva (não disponível — LAI); explicação da obrigação de restituição.

**P7 Eventos e monitoramento** — linha do tempo filtrável por categoria, cada item com fonte e status.

**P8 Metodologia e auditoria** — didática (o que é depósito judicial, papéis, garantias, FGC); diagrama de fluxo do depósito; contas Cosif; regras anti-dupla-contagem; testes de qualidade da execução; registro completo de fontes (URL+hash); selos; limitações; downloads.

Requisitos transversais implementados: números sempre com data e conceito; tooltips; tabelas ordenáveis; busca; visão nominal e %; R$ bi; comparação entre datas (P1); clique → fonte/fórmula/linha original; exportação CSV (cliente) e XLSX (repositório); responsivo; tema claro/escuro; sem decoração que prejudique análise.
