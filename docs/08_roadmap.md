# Lista priorizada de melhorias futuras

## P0 — próximas execuções
1. **Monitorar retorno do BRB à base do BCB** (novo mês em `MONTHS` a cada publicação; o fetch tolera 404).
2. **Enviar os pedidos de LAI** (docs/06) e criar fluxo para incorporar respostas em `data/reference/` com selo `confirmado_fonte_primaria`.
3. **Automatizar via GitHub Actions** (workflow já incluído): execução mensal, commit dos novos dados e re-render do painel; alerta quando um ponto de controle falhar ou uma instituição desaparecer da base.

## P1 — enriquecimento de dados
4. **IF.data (BCB)**: segmento prudencial S1–S5 confirmado, Basileia, liquidez e inadimplência por instituição (páginas 3 e 4 do painel).
5. **Backfill pré-2025**: extrair "obrigações por depósitos judiciais" das DFs anuais (2019–2024) de BB, Caixa, BRB, Banrisul, Banestes, Banese, Banpará — série anual separada, nunca emendada à mensal do BCB.
6. **fact_saldo_tribunal**: popular com saldos oficiais por tribunal (LAI + relatórios de gestão), reduzindo a "origem não identificada publicamente".
7. **Demais segmentos do BCB** (cooperativas, financeiras): verificação única de materialidade da conta 4.1.5.50.
8. **PNCP via API**: monitor de novos editais/contratos com termos "depósitos judiciais" (alerta de migrações).

## P2 — análise
9. **Módulo de spread econômico**: Selic média × remuneração dos depositantes (poupança/TR/IPCA) × contraprestações conhecidas — publicar como intervalo com premissas explícitas, nunca como número único.
10. **Indicadores fiscais dos entes** (página 6): repasses recebidos × RCL, capacidade de recomposição do fundo de reserva (dados Siconfi).
11. **Cenários de estresse descritivos** (sem probabilidades): perda de contrato, decisões em massa, término de exclusividade.
12. **Comparação de remuneração ao depositante** entre esferas (Selic × poupança × IPCA) e efeito da Portaria MF 1.430/2025.

## P3 — produto
13. Mapa coroplético por UF (tribunal contratante) com aviso permanente de que representa origem institucional.
14. Página de comparação entre duas datas com decomposição de variação (entrada/saída de instituições × variação orgânica).
15. Histórico versionado dos JSONs (diffs entre execuções) e feed RSS de eventos.
16. Testes automatizados do frontend e captura de regressões visuais.
17. Verificação dupla independente (segundo parser em DuckDB puro) reconciliando os totais — "agente-espelho" permanente.
