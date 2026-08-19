# Observatório Nacional dos Depósitos Judiciais

Ferramenta pública de investigação e análise dos depósitos judiciais e administrativos no Brasil: quanto existe, em quais bancos está, quais tribunais e entes originaram, quanto já foi transferido aos entes públicos e quais riscos estão associados à concentração — com **auditabilidade de ponta a ponta** (todo número chega à linha original do arquivo do Banco Central, com hash SHA-256).

## Princípio central

"Depósitos judiciais" **não é um único número**. O painel separa: (A) saldo **mantido** nas instituições financeiras; (B) saldo **repassado** à União, estados/DF e municípios; (C) estoque **ampliado** (A+B, que nunca é chamado de "dinheiro nos bancos"). Quando a fonte não separa judicial de administrativo, o rótulo é sempre "depósitos judiciais e administrativos". Ausência de dado é "não disponível", nunca zero.

## Como usar

```bash
pip install -r pipeline/requirements.txt
python3 pipeline/run_all.py            # coleta BCB -> marts -> testes -> exports
python3 -m http.server -d site 8080    # painel em http://localhost:8080
```

O painel (`site/`) é 100% estático — publica direto no GitHub Pages. `site/data/data.js` é regenerado a cada execução do pipeline.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `pipeline/` | Coleta (BCB doc. 4010), transformação (DuckDB/Parquet), 18 testes de qualidade com pontos de controle, exports |
| `data/raw/` | Arquivos brutos do BCB com URL, data e SHA-256 (`data/sources/source_registry.csv`) |
| `data/reference/` | Bases curadas com fonte e status: matriz tribunal–banco, contratos, eventos, dimensões |
| `data/marts/` | Tabelas do painel (fact_saldo_bcb, fact_indicador_bancario, mart_nacional, red flags…) |
| `data/exports/` | `observatorio_depositos_judiciais.xlsx` (Excel auditável) + CSVs |
| `site/` | Painel de 8 páginas (visão nacional, onde estão, bancos e exposição, dossiê BRB, contratos, uso fiscal, eventos, metodologia) |
| `docs/` | Diagnóstico de dados, dicionário de conceitos, marco legal, metodologia, lacunas, modelos de LAI, desenho pré-implementação, roadmap |

## Fontes e escopo

- **Fonte quantitativa**: BCB — Balancetes das IFs, documento 4010 (entidade legal individual), segmento Bancos, série jan/2025→ (a taxonomia Cosif anterior não evidenciava a rubrica; não há série pública comparável antes disso).
- Conta central: **4.1.5.50.00.00-9** (mantidos); repasses: **9.0.9.07/08/09** (classe 9 apenas; espelhos da classe 3 e documento 4016 nunca são somados — regras anti-dupla-contagem testadas a cada execução).
- Matriz tribunal–banco e eventos: fontes documentais públicas (tribunais, PNCP, diários oficiais, CNJ), cada linha com URL, data e selo de status.

**Avisos permanentes**: red flag é sinal para investigação e não prova de irregularidade; relações saldo/patrimônio são medidas de escala, não estimativas de perda; depósitos judiciais **não são cobertos** pelo FGC (Res. CMN 4.222/2013, Anexo II, art. 2º, §1º, III).
