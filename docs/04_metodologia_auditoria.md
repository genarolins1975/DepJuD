# Metodologia e padrão de auditabilidade

## 1. Fonte contábil principal

**Balancetes das Instituições Financeiras — Banco Central do Brasil, documento 4010** (balancete patrimonial da **entidade legal individual**), segmento Bancos.

- Conjunto de dados: <https://dadosabertos.bcb.gov.br/dataset/ifs-balancetes>
- Arquivo mensal: `https://www.bcb.gov.br/content/estabilidadefinanceira/cosif/Bancos/AAAAMMBANCOS.csv.zip`
- Defasagem de publicação: ~60 dias após a data-base (90 dias para dezembro) — Comunicado BCB 20.467/2011.
- Formato: CSV latin-1, separador `;`, decimal `,`; colunas DATA_BASE, DOCUMENTO, CNPJ (raiz, 8 dígitos), NOME_INSTITUICAO, TAXONOMIA, CONTA (10 dígitos com DV), NOME_CONTA, SALDO.

### Contas utilizadas (taxonomia Cosif vigente desde jan/2025)

| Conta (código no arquivo) | Nome | Papel |
|---|---|---|
| 4.1.5.50.00.00-9 (`4155000009`) | Depósitos judiciais e administrativos mantidos na instituição | **Conceito A** (passivo) |
| 9.0.9.07 (`9090700005`) | Repassados à União | **Conceito B** |
| 9.0.9.08 (`9090800008`) | Repassados a estados e DF | **Conceito B** |
| 9.0.9.09 (`9090900001`) | Repassados a municípios | **Conceito B** |
| 3.0.9.07/08/09 (`3090700001` etc.) | Espelho na compensação ativa | Somente teste de consistência — **nunca somado** |
| 8.1.1.40 (`8114000008`) | (-) Despesas de depósitos judiciais mantidos | Custo de remuneração (acumulado semestral) — contexto |
| 1.8.9.98 (`1899800001`) | (-) Provisão p/ perdas em restituição de dep. judiciais | Contexto |
| `1000000009`+`2000000008`, `4100000009`, `4200000002`, `4300000005`, `4600000004`, `6000000004` | Ativo total, depósitos, compromissadas, dívida, repasses, PL | Denominadores dos indicadores |

### Regras obrigatórias de integridade (implementadas em `pipeline/`)

1. **Entidade individual (CNPJ raiz)** — nunca misturar banco e conglomerado. O arquivo mensal de jun/dez traz também o documento **4016** (conglomerado prudencial): o pipeline o **descarta integralmente** (`build_marts.py`) e um teste garante zero linhas 4016 no staging.
2. **Classe 9 apenas** para os repasses; a classe 3 é espelho e um teste verifica a igualdade (divergência ⇒ issue).
3. **Ausência ≠ zero**: instituição sem linha na data-base não entra na soma; é listada em `mart_instituicoes_ausentes.csv` com o último valor e a última data disponíveis, e o painel exibe o aviso.
4. **Sem série falsa**: a série começa em **jan/2025**. Antes disso o balancete público não revela a rubrica neste nível (mudança da taxonomia Cosif — Res. CMN 4.966/2021 e regulamentação correlata). Backfill pré-2025 somente por demonstrações financeiras, formulários de referência, relatórios de tribunais e LAI (roadmap).
5. **Rastreabilidade total**: cada arquivo bruto é guardado em `data/raw/bcb_balancetes/` com URL, data de download, tamanho e **SHA-256** em `data/sources/source_registry.csv`; cada linha usada carrega o **número da linha original** do CSV do BCB e o hash do arquivo (`fact_saldo_bcb.csv`), permitindo chegar da visualização à linha original.
6. **Quebras de série e mudanças de Cosif** são registradas neste documento e no painel (página Metodologia).

## 2. Pontos de controle

Valores **reproduzidos manualmente nos arquivos oficiais antes da automação** e verificados a cada execução (`pipeline/quality_checks.py`, tolerância 0,5%; falha ⇒ execução INVÁLIDA). Resultado da execução corrente: todos os 18 testes PASSARAM (desvios ≤ 0,1%).

| Data-base | Item | Esperado (aprox.) | Obtido |
|---|---|---|---|
| mar/2026 | BB mantidos | R$ 296,9 bi | R$ 296,897 bi |
| mar/2026 | Caixa mantidos | R$ 154,6 bi | R$ 154,593 bi |
| mar/2026 | Banrisul mantidos | R$ 11,0 bi | R$ 11,039 bi |
| mar/2026 | Banestes mantidos | R$ 5,0 bi | R$ 4,996 bi |
| mar/2026 | Banese mantidos | R$ 2,1 bi | R$ 2,103 bi |
| mar/2026 | Total mantidos | ~R$ 470,4 bi | R$ 470,366 bi |
| mar/2026 | Repassados à União | R$ 396,4 bi | R$ 396,405 bi |
| mar/2026 | Repassados a estados/DF | R$ 77,7 bi | R$ 77,723 bi |
| mar/2026 | Repassados a municípios | R$ 24,0 bi | R$ 24,024 bi |
| set/2025 | BRB mantidos / rep. estados / rep. municípios | 22,3 / 5,9 / 1,8 bi | 22,259 / 5,866 / 1,786 bi |
| jun/2025 | BRB soma dos componentes | ~R$ 25,6 bi | R$ 25,602 bi |

**Notas de reconciliação BRB:**
- A soma de jun/2025 (R$ 25,6 bi) é consistente com divulgações de mercado sobre uma "carteira de ~R$ 25 bi"; a divulgação original do BRB **não foi localizada em fonte primária** (status: não confirmado).
- O estoque ampliado de set/2025 (R$ 29,9 bi) e nov/2025 (R$ 30,0 bi) é consistente com os "até R$ 30 bi" citados pela Corregedoria Nacional de Justiça em fev/2026 (cinco tribunais).
- **Ausência do BRB**: o banco está presente até set/2025, ausente em out/2025, presente em nov/2025 e ausente de dez/2025 em diante. A razão não foi explicada oficialmente por BCB ou BRB (hipótese natural — não entrega/não publicação durante a apuração do caso Master — **não confirmada**). O painel nunca soma o valor de nov/2025 do BRB aos totais de datas posteriores.
- Diferenças entre BCB (4010, individual), demonstrações financeiras (consolidado, últimas de jun/2025) e números de tribunais/imprensa decorrem de: data-base, escopo da entidade (individual × conglomerado), inclusão de precatórios/RPV nos números de contratos, fundo de reserva e classificação contábil. Cada número no painel declara sua fonte e data.

## 3. Padrão de auditabilidade

Todo número no painel carrega (diretamente ou via clique em "Como este número foi calculado?"): fonte, URL, arquivo, linha original, data-base, data de coleta, conceito, fórmula, unidade, transformação e status de validação. Selos definidos em `docs/02_dicionario_conceitos.md`.

**Proibições implementadas como regra de pipeline e de redação:** não inventar valores; não interpolar silenciosamente; não tratar ausência como zero; não misturar datas sem aviso; não misturar judicial com administrativo sem aviso (o rótulo padrão é "judiciais e administrativos"); não misturar mantido com repassado; não misturar individual com conglomerado; não apresentar notícia como confirmação contábil; não associar red flag a ilícito.

## 4. Red flags — regras e limiares

| Regra | Limiar | Racional |
|---|---|---|
| `crescimento_12m` | > 50% em 12 meses | Crescimento muito acima do orgânico sugere entrada de contratos — verificar origem |
| `mantidos_sobre_captacao` | > 20% | Dependência de uma única fonte de funding administrada por terceiros |
| `ampliado_sobre_pl` | > 3× | Escala da administração vs. capacidade própria de absorção |
| `queda_brusca_3m` | < −30% em 3 meses | Possível perda de contrato ou saques em massa |
| `ausencia_ultima_base` | ausente da última data-base | Possível atraso de demonstrações — verificar |

Cada sinal publicado traz regra, valor observado, limiar, fonte, data, explicação, materialidade e status de apuração, com o aviso fixo: **"Red flag é sinal para investigação e não prova de irregularidade."**

## 5. Limitações e quebras de série

1. Agregado inclui depósitos judiciais **e** administrativos (limite da fonte).
2. Sem abertura por natureza (tributário, recursal, fiança) nem por tribunal na fonte do BCB.
3. Fundo de reserva não evidenciado no balancete público.
4. Cobertura: segmento **Bancos** do arquivo do BCB. Outros segmentos (cooperativas etc.) não incluídos.
5. Série inicia em jan/2025 (quebra estrutural da taxonomia Cosif; não há série pública comparável anterior neste nível).
6. Meses ainda não publicados (abr–mai/2026 na execução corrente) constam como "não disponível".
7. A matriz tribunal–banco é documental e inerentemente incompleta; saldos não publicados = "não localizado", nunca rateados.

## 6. Execução

```
pip install -r pipeline/requirements.txt
python3 pipeline/run_all.py       # fetch → staging/marts → quality → exports
```
Saídas: `data/marts/`, `data/quality/quality_report.json`, `data/exports/observatorio_depositos_judiciais.xlsx`, `site/data/*.json` + `data.js`. O painel é 100% estático (`site/index.html`).
