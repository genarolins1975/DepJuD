# Dicionário de conceitos

Cada conceito abaixo tem um identificador estável usado nas tabelas, nos exports e no painel.

## Os três números nacionais

| ID | Conceito | Definição | Fonte | O que NÃO é |
|---|---|---|---|---|
| **A** | Saldo mantido nos bancos | Soma da conta Cosif 4.1.5.50.00.00-9 (Depósitos judiciais e administrativos mantidos na instituição), documento 4010, todas as instituições presentes na data-base | BCB balancetes | Não é "todo o dinheiro de depósitos judiciais do país": exclui o que já foi repassado aos entes |
| **B** | Saldo repassado aos entes públicos | Soma das contas de controle 9.0.9.07 (União) + 9.0.9.08 (estados/DF) + 9.0.9.09 (municípios) | BCB balancetes | Não é dinheiro no banco: registra a obrigação potencial de restituição dos entes |
| **C** | Estoque ampliado sob administração ou registro | A + B, condicionado à validação contábil e jurídica da interpretação | derivado | **Nunca** denominar "dinheiro depositado nos bancos" |

## Naturezas e categorias (não separáveis na fonte contábil pública)

| Conceito | Definição | Onde é/seria observável |
|---|---|---|
| Depósito judicial | Valor entregue em juízo no curso de um processo judicial (garantia, discussão, consignação) | Agregado com administrativos no Cosif; separação exigiria dados dos tribunais/LAI |
| Depósito administrativo | Depósito em processo administrativo (ex.: discussão fiscal administrativa) | idem |
| Depósito tributário / não tributário | Conforme a natureza da obrigação discutida | LC 151/2015 separa juridicamente; a fonte contábil pública não |
| Depósito recursal trabalhista | Pressuposto de admissibilidade recursal (CLT art. 899); desde 2017 em conta vinculada ao juízo, corrigido pela poupança | Agregado no Cosif; dados por segmento exigiriam CSJT/LAI |
| Fianças, cauções e valores criminais | Garantias em processos criminais e contratuais | Agregado; a Lei 14.973/2024 alcança expressamente cauções federais |
| Precatórios e RPVs | Requisições de pagamento contra a Fazenda vencida (CF art. 100) | **Fora dos totais do painel** — não são depósitos judiciais |
| Depósitos de processos encerrados não levantados | Valores à disposição do vencedor, não sacados | Não observável na fonte pública; Lei 14.973/2024 art. 39 criou prazo de 2 anos na esfera federal |
| Fundo de reserva | Parcela mínima de 30% mantida na instituição para garantir restituições (LC 151/2015 art. 3º) | **Não evidenciado** no balancete público; buscar em DFs, tribunais e LAI |

## Papéis institucionais

| Papel | Definição |
|---|---|
| Banco custodiante/depositário | Instituição financeira que guarda e remunera o depósito e executa alvarás. Nos contratos aparecem como sinônimos; quando um contrato distingue custódia de depósito, a distinção é registrada no campo `tipos_valores` |
| Tribunal gestor | Tribunal que administra as contas judiciais, autoriza movimentações (alvarás) e contrata a instituição |
| Ente beneficiário | União, estado, DF ou município que recebe repasses autorizados por lei e assume a obrigação de restituição |
| Banco do estoque legado | Banco que mantém depósitos antigos após o tribunal trocar de instituição |
| Banco dos novos fluxos | Banco que recebe os depósitos novos após a troca |

## Indicadores de exposição (medidas de escala, NÃO estimativas de perda)

| Indicador | Fórmula (contas do doc. 4010) |
|---|---|
| mantidos_sobre_ativos | 4.1.5.50 / (1.0.0 Ativo Realizável + 2.0.0 Ativo Permanente) |
| mantidos_sobre_depositos | 4.1.5.50 / 4.1.0 (Depósitos totais) |
| mantidos_sobre_captacao | 4.1.5.50 / (4.1.0 + 4.2.0 + 4.3.0 + 4.6.0) — "captação proxy" |
| mantidos_sobre_pl | 4.1.5.50 / 6.0.0 (Patrimônio Líquido) |
| ampliado_sobre_pl | (A + B da instituição) / 6.0.0 |
| CR1/CR2/CR5 | participação do(s) maior(es) banco(s) no conceito A |
| HHI | soma dos quadrados das participações × 10.000 |

## Selos de validação

`confirmado_duas_fontes` · `confirmado_fonte_primaria` · `confirmado_imprensa` · `calculo_derivado` · `estimativa` (não usado nesta versão — nada é estimado) · `informacao_conflitante` · `nao_disponivel` · `desatualizado/dado_defasado`.

## Regras de linguagem obrigatórias

1. Quando a fonte não separa, escrever sempre **"depósitos judiciais e administrativos"**.
2. Nunca apresentar o conceito C como "dinheiro depositado nos bancos".
3. Ausência = "não disponível", nunca zero.
4. "Red flag é sinal para investigação e não prova de irregularidade" — visível em toda listagem de red flags.
5. A relação saldo/patrimônio é medida de escala e concentração, não estimativa automática de perda.
