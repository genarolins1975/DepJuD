# Diagnóstico de disponibilidade de dados

Avaliação de cada pergunta do Observatório contra as fontes públicas existentes (situação em 19/08/2026).

| # | Pergunta | Disponibilidade | Fonte | Observação |
|---|---|---|---|---|
| 1 | Volume nacional de depósitos judiciais | **Alta** (com ressalva conceitual) | BCB doc. 4010, conta 4.1.5.50 | Agregado inclui administrativos; série pública desde jan/2025 |
| 2 | Em quais bancos | **Alta** | BCB doc. 4010, por CNPJ | 14 instituições com saldo na série |
| 3 | Tribunais/entes de origem | **Baixa–média** | Tribunais, PNCP, diários, imprensa | O BCB não identifica origem; matriz documental incompleta por construção |
| 4 | Quanto no balanço de cada banco | **Alta** | idem #2 | Entidade legal individual, sem mistura com conglomerado |
| 5 | Quanto repassado a União/estados/DF/municípios | **Alta** | Contas 9.0.9.07/08/09 | Por banco custodiante; não por ente individual (ex.: não separa qual estado) |
| 6 | Exposição do BRB e bancos menores | **Alta até nov/2025 (BRB); alta demais bancos** | BCB + DFs | BRB ausente das bases desde dez/2025 (e out/2025) — dado defasado sinalizado |
| 7 | Riscos associados | **Média** | derivado + eventos documentados | Indicadores de escala calculáveis; perda esperada NÃO calculável com dados públicos |

## Disponível hoje (implementado)

- Série mensal jan/2025–mar/2026, 14 instituições, conceitos A, B e C, com hash e linha de origem.
- Indicadores de exposição (ativos, depósitos, captação proxy, PL) da mesma fonte.
- Concentração (CR1/CR2/CR5/HHI).
- Matriz tribunal–banco com 17 relações documentadas (fontes primárias na maioria).
- Linha do tempo de eventos BRB/Master/CNJ 2025–2026 com fontes.

## Não disponível publicamente (lacunas estruturais)

- Separação judicial × administrativo, tributário × não tributário, por segmento de Justiça.
- Saldos de **fundos de reserva** por instituição/ente.
- **Contraprestações** pagas pelos bancos aos tribunais (exceto TJPA–Banpará, localizada em diário oficial).
- Saldo por tribunal de forma sistemática (só divulgações esparsas).
- Depósitos de processos encerrados não levantados.
- Balancetes do BRB desde dez/2025.
- Série pública comparável anterior a 2025 no nível da rubrica.

Ver `05_relatorio_lacunas.md` (priorização) e `06_modelos_LAI.md` (pedidos de acesso à informação prontos).
