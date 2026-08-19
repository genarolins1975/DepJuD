# -*- coding: utf-8 -*-
"""
Exportações do Observatório:
- site/data/*.json  : dados estáticos consumidos pelo painel (frontend);
- data/exports/*.csv: cópias auditáveis dos marts;
- data/exports/observatorio_depositos_judiciais.xlsx: Excel auditável.

Todo número exportado carrega: fonte, conceito, data-base e rastreabilidade
(arquivo + linha + SHA-256 nos marts de origem).
"""

import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config

DTYPES = {"cnpj_raiz": str, "data_base": str, "conta": str, "codigo_cnj": str}


def rcsv(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path, dtype={k: v for k, v in DTYPES.items()})


def jdump(obj, name: str) -> None:
    config.SITE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(config.SITE_DATA_DIR / name, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, allow_nan=False, default=_nan_to_none)


def _nan_to_none(o):
    return None


def clean(df: pd.DataFrame) -> list:
    return json.loads(df.to_json(orient="records", force_ascii=False))


def main() -> None:
    nac = rcsv(config.MARTS_DIR / "mart_nacional.csv")
    ind = rcsv(config.MARTS_DIR / "fact_indicador_bancario.csv")
    cresc = rcsv(config.MARTS_DIR / "fact_crescimento.csv")
    flags = rcsv(config.MARTS_DIR / "mart_red_flags.csv")
    ausentes = rcsv(config.MARTS_DIR / "mart_instituicoes_ausentes.csv")
    saldo = rcsv(config.MARTS_DIR / "fact_saldo_bcb.csv")
    registry = rcsv(config.SOURCES_DIR / "source_registry.csv")
    quality = json.loads((config.QUALITY_DIR / "quality_report.json").read_text("utf-8"))

    contratos = rcsv(config.REFERENCE_DIR / "fact_contrato.csv")
    tribunais = rcsv(config.REFERENCE_DIR / "dim_tribunal.csv")
    eventos = rcsv(config.REFERENCE_DIR / "fact_evento.csv")
    saldo_trib = rcsv(config.REFERENCE_DIR / "fact_saldo_tribunal.csv")

    last = nac["data_base"].max()
    gerado = datetime.now(timezone.utc).isoformat(timespec="seconds")

    meta = {
        "gerado_em_utc": gerado,
        "ultima_data_base": last,
        "fonte_principal": "Banco Central do Brasil — Balancetes (documento 4010, segmento Bancos)",
        "url_fonte": "https://dadosabertos.bcb.gov.br/dataset/ifs-balancetes",
        "conta_mantidos": "4.1.5.50.00.00-9 (4155000009) — Depósitos judiciais e administrativos mantidos na instituição",
        "contas_repasse": {
            "Uniao": "9.0.9.07 (9090700005)",
            "Estados_DF": "9.0.9.08 (9090800008)",
            "Municipios": "9.0.9.09 (9090900001)",
        },
        "avisos": [
            "Os agregados incluem depósitos judiciais E administrativos (a fonte não permite separar).",
            "Documento 4010 (entidade legal individual); o conglomerado (4016) não é somado.",
            "Valores repassados: somente contas de controle da classe 9 (espelho da classe 3 não é somado).",
            "Ausência de informação é tratada como 'não disponível', nunca como zero.",
            "Cobertura: segmento Bancos. Instituições ausentes na última data-base são listadas e NÃO somadas.",
            "Estoque ampliado (conceito C) = mantidos + repassados; NÃO é 'dinheiro depositado nos bancos': "
            "os valores repassados podem já estar fora do banco e constituir obrigação de restituição do ente público.",
        ],
        "resultado_qualidade": quality["resultado_geral"],
    }
    jdump(meta, "meta.json")

    # ---- nacional.json ----
    jdump({
        "serie": clean(nac),
        "ultima": clean(nac[nac["data_base"] == last])[0],
        "ausentes_ultima_base": clean(ausentes),
    }, "nacional.json")

    # ---- bancos.json ----
    ind_s = ind.sort_values(["cnpj_raiz", "data_base"])
    serie_por_banco = {
        c: clean(g[["data_base", "mantidos", "rep_uniao", "rep_estados_df",
                    "rep_municipios", "estoque_ampliado", "ativo_total",
                    "depositos_totais", "captacao_proxy", "patrimonio_liquido",
                    "mantidos_sobre_ativos", "mantidos_sobre_depositos",
                    "mantidos_sobre_captacao", "mantidos_sobre_pl", "ampliado_sobre_pl"]])
        for c, g in ind_s.groupby("cnpj_raiz")
    }
    ult_por_banco = []
    for c, g in ind_s.groupby("cnpj_raiz"):
        lastrow = g.iloc[-1].to_dict()
        gg = cresc[(cresc["cnpj_raiz"] == c)]
        if not gg.empty:
            lr = gg.sort_values("data_base").iloc[-1]
            lastrow["cresc_3m"], lastrow["cresc_12m"] = lr["cresc_3m"], lr["cresc_12m"]
        lastrow["defasado"] = lastrow["data_base"] != last
        ult_por_banco.append(lastrow)
    jdump({"ultima_por_banco": clean(pd.DataFrame(ult_por_banco)),
           "series": serie_por_banco}, "bancos.json")

    # ---- redflags.json / contratos / tribunais / eventos ----
    jdump(clean(flags), "redflags.json")
    jdump(clean(contratos), "contratos.json")
    jdump(clean(tribunais), "tribunais.json")
    jdump(clean(eventos), "eventos.json")
    jdump(clean(saldo_trib), "saldo_tribunal.json")
    jdump(quality, "quality.json")
    jdump(clean(registry), "fontes.json")

    # ---- auditoria: linhas originais das contas judiciais (drill-down) ----
    jdump(clean(saldo), "fact_saldo_bcb.json")

    # ---- data.js: bundle único para o frontend (funciona sem servidor) ----
    bundle = {}
    for name in ["meta", "nacional", "bancos", "redflags", "contratos", "tribunais",
                 "eventos", "saldo_tribunal", "quality", "fontes", "fact_saldo_bcb"]:
        bundle[name] = json.loads((config.SITE_DATA_DIR / f"{name}.json").read_text("utf-8"))
    with open(config.SITE_DATA_DIR / "data.js", "w", encoding="utf-8") as f:
        f.write("window.__DATA__ = ")
        json.dump(bundle, f, ensure_ascii=False)
        f.write(";")

    # ---- exports CSV ----
    config.EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    for f in ["mart_nacional", "fact_indicador_bancario", "fact_saldo_bcb",
              "fact_valor_repassado", "mart_red_flags", "mart_instituicoes_ausentes",
              "fact_crescimento"]:
        src = config.MARTS_DIR / f"{f}.csv"
        if src.exists():
            shutil.copy(src, config.EXPORTS_DIR / f"{f}.csv")

    # ---- Excel auditável ----
    xlsx = config.EXPORTS_DIR / "observatorio_depositos_judiciais.xlsx"
    with pd.ExcelWriter(xlsx, engine="openpyxl") as w:
        leia = pd.DataFrame({
            "Observatório Nacional dos Depósitos Judiciais": [
                f"Gerado em (UTC): {gerado}",
                f"Última data-base: {last}",
                "Fonte principal: BCB — Balancetes (doc. 4010, segmento Bancos)",
                "Conta de mantidos: 4.1.5.50.00.00-9",
                "Repasses: 9.0.9.07 (União), 9.0.9.08 (Estados/DF), 9.0.9.09 (Municípios)",
                "", "AVISOS:",
            ] + meta["avisos"] + [
                "", f"Resultado do controle de qualidade: {quality['resultado_geral']}",
                "Cada linha de 'Linhas_originais_BCB' traz arquivo, nº da linha e SHA-256 do arquivo bruto.",
            ]})
        leia.to_excel(w, sheet_name="Leia-me", index=False)
        nac.to_excel(w, sheet_name="Nacional_mensal", index=False)
        ind.to_excel(w, sheet_name="Indicadores_bancarios", index=False)
        rcsv(config.MARTS_DIR / "fact_valor_repassado.csv").to_excel(
            w, sheet_name="Repasses_entes", index=False)
        saldo.to_excel(w, sheet_name="Linhas_originais_BCB", index=False)
        flags.to_excel(w, sheet_name="Red_flags", index=False)
        ausentes.to_excel(w, sheet_name="Instituicoes_ausentes", index=False)
        if not contratos.empty:
            contratos.to_excel(w, sheet_name="Contratos_tribunal_banco", index=False)
        if not tribunais.empty:
            tribunais.to_excel(w, sheet_name="Tribunais", index=False)
        if not eventos.empty:
            eventos.to_excel(w, sheet_name="Eventos", index=False)
        registry.to_excel(w, sheet_name="Fontes", index=False)
        pd.DataFrame(quality["checks"]).to_excel(w, sheet_name="Qualidade", index=False)
    print(f"[export] concluido: {xlsx.name} + JSONs em site/data/")


if __name__ == "__main__":
    main()
