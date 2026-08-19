# -*- coding: utf-8 -*-
"""
Configuração central do pipeline do Observatório Nacional dos Depósitos Judiciais.

Fonte primária: Balancetes das Instituições Financeiras (documento 4010) — Banco Central do Brasil.
URL do conjunto de dados: https://dadosabertos.bcb.gov.br/dataset/ifs-balancetes
Arquivo mensal (segmento Bancos): https://www.bcb.gov.br/content/estabilidadefinanceira/cosif/Bancos/AAAAMMBANCOS.csv.zip

IMPORTANTE — a taxonomia Cosif vigente a partir de jan/2025 (Res. CMN 4.966/2021 e correlatas)
passou a evidenciar a rubrica de depósitos judiciais no balancete público. Antes de 2025 o
balancete público NÃO revela a rubrica no mesmo nível de detalhe — não construir série falsa.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw" / "bcb_balancetes"
STAGING_DIR = ROOT / "data" / "staging"
MARTS_DIR = ROOT / "data" / "marts"
QUALITY_DIR = ROOT / "data" / "quality"
EXPORTS_DIR = ROOT / "data" / "exports"
REFERENCE_DIR = ROOT / "data" / "reference"
SOURCES_DIR = ROOT / "data" / "sources"
SITE_DATA_DIR = ROOT / "site" / "data"

BCB_URL_TEMPLATE = (
    "https://www.bcb.gov.br/content/estabilidadefinanceira/cosif/Bancos/{yyyymm}BANCOS.csv.zip"
)

# Meses cobertos pela série (taxonomia nova, a partir de jan/2025).
# Meses ainda não publicados são tolerados (HTTP 404 => "não disponível", nunca zero).
MONTHS = [
    "202501", "202502", "202503", "202504", "202505", "202506",
    "202507", "202508", "202509", "202510", "202511", "202512",
    "202601", "202602", "202603", "202604", "202605",
]

# Documento utilizado: SOMENTE 4010 (balancete individual da entidade legal).
# O arquivo mensal de jun/dez também traz o documento 4016 (conglomerado prudencial).
# Regra anti-dupla-contagem: nunca somar 4010 e 4016; este pipeline usa exclusivamente 4010.
DOCUMENTO = "4010"

# ---------------------------------------------------------------------------
# Contas Cosif (taxonomia vigente desde 2025). Código de 10 dígitos como consta
# no arquivo do BCB (inclui dígito verificador).
# ---------------------------------------------------------------------------
CONTAS = {
    # Passivo — saldo mantido na instituição (conceito A)
    "4155000009": "Depósitos judiciais e administrativos mantidos na instituição (4.1.5.50.00.00-9)",
    # Compensação passiva (classe 9) — valores repassados (conceito B).
    # ATENÇÃO: as contas 3.0.9.07/08/09 (classe 3, compensação ativa) são o ESPELHO
    # destas; somar classe 3 + classe 9 duplicaria os valores. Usamos SOMENTE a classe 9.
    "9090700005": "Depósitos judiciais e administrativos repassados à União (9.0.9.07)",
    "9090800008": "Depósitos judiciais e administrativos repassados a estados e DF (9.0.9.08)",
    "9090900001": "Depósitos judiciais e administrativos repassados a municípios (9.0.9.09)",
    # Despesa de remuneração dos depósitos mantidos (conta de resultado, acumulada no semestre)
    "8114000008": "(-) Despesas de depósitos judiciais e administrativos mantidos na instituição",
    # Provisão para perdas em restituição de depósitos judiciais (ativo retificador)
    "1899800001": "(-) Provisão para perdas de crédito em restituição de depósitos judiciais e administrativos",
}

CONTAS_ESPELHO_CLASSE_3 = {
    "3090700001": "9090700005",
    "3090800004": "9090800008",
    "3090900007": "9090900001",
}

# Contas estruturais para indicadores de exposição (mesmo documento 4010)
CONTAS_ESTRUTURAIS = {
    "1000000009": "Ativo Realizável",
    "2000000008": "Ativo Permanente",
    "4100000009": "Depósitos (totais)",
    "4200000002": "Obrigações por operações compromissadas",
    "4300000005": "Outros instrumentos de dívida",
    "4600000004": "Obrigações por empréstimos e repasses",
    "6000000004": "Patrimônio Líquido",
}

CONTA_MANTIDOS = "4155000009"
CONTAS_REPASSE = ["9090700005", "9090800008", "9090900001"]

# ---------------------------------------------------------------------------
# Pontos de controle — valores reproduzidos manualmente nos arquivos oficiais
# ANTES da automação (ver docs/04_metodologia_auditoria.md). Servem para validar
# o pipeline; se qualquer teste falhar, a execução é marcada como inválida.
# Valores em R$ (unidades). Tolerância relativa: 0,5%.
# ---------------------------------------------------------------------------
CONTROL_POINTS = [
    # (data_base, nome parcial da instituição, conta, valor esperado em R$)
    ("202603", "BCO DO BRASIL",        "4155000009", 296_897_300_000.0),
    ("202603", "CAIXA ECONOMICA",      "4155000009", 154_593_400_000.0),
    ("202603", "BCO DO ESTADO DO RS",  "4155000009", 11_039_300_000.0),
    ("202603", "BANESTES",             "4155000009", 4_995_600_000.0),
    ("202603", "BCO DO EST. DE SE",    "4155000009", 2_102_800_000.0),
    ("202509", "BRB",                  "4155000009", 22_258_600_000.0),
    ("202509", "BRB",                  "9090800008", 5_865_800_000.0),
    ("202509", "BRB",                  "9090900001", 1_786_200_000.0),
    ("202506", "BRB",                  "4155000009", 19_428_900_000.0),
]

# Totais nacionais de controle (soma do documento 4010, segmento Bancos), R$
CONTROL_TOTALS = [
    ("202603", "4155000009", 470_400_000_000.0, 0.01),   # mantidos ~470,4 bi (tolerância 1%)
    ("202603", "9090700005", 396_400_000_000.0, 0.005),
    ("202603", "9090800008", 77_700_000_000.0, 0.005),
    ("202603", "9090900001", 24_000_000_000.0, 0.005),
]

CONTROL_TOLERANCE = 0.005  # 0,5% para pontos individuais

# Limiar de materialidade para constar dos rankings (R$)
LIMIAR_RANKING = 100_000.0

# Red flags — limiares transparentes (ver metodologia). Red flag é sinal para
# investigação, não prova de irregularidade.
RED_FLAG_RULES = {
    "crescimento_12m": 0.50,          # crescimento do saldo mantido > 50% em 12 meses
    "mantidos_sobre_captacao": 0.20,  # mantidos > 20% da captação proxy
    "ampliado_sobre_pl": 3.0,         # estoque ampliado > 3x o patrimônio líquido
    "queda_brusca_3m": -0.30,         # queda > 30% em 3 meses
}
