# -*- coding: utf-8 -*-
"""
Transformação: raw (zip do BCB) -> staging (Parquet) -> marts (CSV).

Regras de integridade aplicadas aqui (ver docs/04_metodologia_auditoria.md):
1. Somente documento 4010 (entidade legal individual). O 4016 (conglomerado
   prudencial), presente nos arquivos de jun/dez, é IGNORADO — nunca somado.
2. Valores repassados: somente contas da classe 9 (9.0.9.07/08/09). As contas
   espelho da classe 3 (3.0.9.07/08/09) são carregadas apenas para o teste de
   consistência e NUNCA somadas aos totais.
3. Ausência de instituição em uma data-base => "não disponível" (linha ausente),
   jamais zero.
4. Cada linha de staging carrega arquivo de origem, número da linha original e
   SHA-256 do arquivo bruto (rastreabilidade até a fonte).
"""

import csv
import io
import sys
import zipfile
from pathlib import Path

import duckdb
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config

TARGET_CONTAS = (
    set(config.CONTAS) | set(config.CONTAS_ESTRUTURAIS) | set(config.CONTAS_ESPELHO_CLASSE_3)
)


def load_registry() -> dict:
    reg = {}
    with open(config.SOURCES_DIR / "source_registry.csv", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            reg[row["data_base"]] = row
    return reg


def parse_month_zip(zip_path: Path, sha256: str) -> pd.DataFrame:
    """Extrai as linhas das contas-alvo, preservando o número da linha original."""
    with zipfile.ZipFile(zip_path) as z:
        inner = [n for n in z.namelist() if n.upper().endswith(".CSV")]
        assert len(inner) == 1, f"esperado 1 CSV em {zip_path.name}, encontrado {inner}"
        raw = z.read(inner[0]).decode("latin-1")

    lines = raw.splitlines()
    header_idx = next(i for i, l in enumerate(lines) if l.startswith("#DATA_BASE"))
    cols = lines[header_idx].lstrip("#").split(";")

    records = []
    for i in range(header_idx + 1, len(lines)):
        line = lines[i]
        if not line.strip():
            continue
        parts = line.split(";")
        if len(parts) != len(cols):
            continue
        rec = dict(zip(cols, parts))
        if rec["CONTA"] not in TARGET_CONTAS:
            continue
        saldo_txt = rec["SALDO"].replace(".", "").replace(",", ".") if rec["SALDO"] else ""
        rec["_saldo"] = float(saldo_txt) if saldo_txt else None
        rec["_linha_arquivo"] = i + 1  # 1-based, no CSV original
        rec["_arquivo"] = inner[0]
        rec["_sha256"] = sha256
        records.append(rec)

    df = pd.DataFrame.from_records(records)
    if df.empty:
        return df
    df = df.rename(columns={
        "DATA_BASE": "data_base", "DOCUMENTO": "documento", "CNPJ": "cnpj_raiz",
        "NOME_INSTITUICAO": "nome_instituicao", "TAXONOMIA": "taxonomia",
        "CONTA": "conta", "NOME_CONTA": "nome_conta",
        "_saldo": "saldo", "_linha_arquivo": "linha_arquivo",
        "_arquivo": "arquivo", "_sha256": "sha256_arquivo",
    })
    return df[["data_base", "documento", "cnpj_raiz", "nome_instituicao", "taxonomia",
               "conta", "nome_conta", "saldo", "linha_arquivo", "arquivo", "sha256_arquivo"]]


def build_staging() -> pd.DataFrame:
    registry = load_registry()
    frames = []
    for m in config.MONTHS:
        reg = registry.get(m)
        if not reg or reg["status"] != "ok":
            print(f"[staging] {m}: sem arquivo (status={reg['status'] if reg else 'ausente'}) — pulado")
            continue
        zip_path = config.ROOT / reg["arquivo_local"]
        df = parse_month_zip(zip_path, reg["sha256"])
        n4016 = (df["documento"] == "4016").sum()
        df = df[df["documento"] == config.DOCUMENTO].copy()
        print(f"[staging] {m}: {len(df)} linhas doc.4010 (descartadas {n4016} linhas doc.4016)")
        frames.append(df)
    stg = pd.concat(frames, ignore_index=True)
    config.STAGING_DIR.mkdir(parents=True, exist_ok=True)
    stg.to_parquet(config.STAGING_DIR / "stg_balancete.parquet", index=False)
    return stg


def build_marts() -> None:
    stg_path = str(config.STAGING_DIR / "stg_balancete.parquet")
    con = duckdb.connect()
    con.execute(f"CREATE VIEW stg AS SELECT * FROM read_parquet('{stg_path}')")

    dim_banco = pd.read_csv(config.REFERENCE_DIR / "dim_banco.csv", dtype=str)
    con.register("dim_banco_ref", dim_banco)

    config.MARTS_DIR.mkdir(parents=True, exist_ok=True)

    # ---- fact_saldo_bcb: contas judiciais, granularidade banco x mês x conta ----
    contas_jud = list(config.CONTAS.keys())
    fact_saldo = con.execute(f"""
        SELECT data_base, cnpj_raiz, nome_instituicao, conta, nome_conta, saldo,
               arquivo, linha_arquivo, sha256_arquivo,
               'BCB balancete doc. 4010' AS fonte
        FROM stg WHERE conta IN ({','.join("'"+c+"'" for c in contas_jud)})
        ORDER BY data_base, nome_instituicao, conta
    """).df()
    fact_saldo.to_csv(config.MARTS_DIR / "fact_saldo_bcb.csv", index=False)

    # ---- fact_valor_repassado ----
    fact_rep = con.execute("""
        SELECT data_base, cnpj_raiz, nome_instituicao,
               CASE conta WHEN '9090700005' THEN 'Uniao'
                          WHEN '9090800008' THEN 'Estados e DF'
                          WHEN '9090900001' THEN 'Municipios' END AS ente_destino,
               conta, saldo, arquivo, linha_arquivo, sha256_arquivo
        FROM stg WHERE conta IN ('9090700005','9090800008','9090900001')
        ORDER BY data_base, nome_instituicao, conta
    """).df()
    fact_rep.to_csv(config.MARTS_DIR / "fact_valor_repassado.csv", index=False)

    # ---- fact_indicador_bancario: visão larga por banco x mês ----
    ind = con.execute("""
        WITH pivo AS (
          SELECT data_base, cnpj_raiz, nome_instituicao,
            SUM(CASE WHEN conta='4155000009' THEN saldo END) AS mantidos,
            SUM(CASE WHEN conta='9090700005' THEN saldo END) AS rep_uniao,
            SUM(CASE WHEN conta='9090800008' THEN saldo END) AS rep_estados_df,
            SUM(CASE WHEN conta='9090900001' THEN saldo END) AS rep_municipios,
            SUM(CASE WHEN conta='8114000008' THEN saldo END) AS despesa_remuneracao_sem,
            SUM(CASE WHEN conta='1899800001' THEN saldo END) AS provisao_restituicao,
            SUM(CASE WHEN conta IN ('1000000009','2000000008') THEN saldo END) AS ativo_total,
            SUM(CASE WHEN conta='4100000009' THEN saldo END) AS depositos_totais,
            SUM(CASE WHEN conta IN ('4100000009','4200000002','4300000005','4600000004')
                     THEN saldo END) AS captacao_proxy,
            SUM(CASE WHEN conta='6000000004' THEN saldo END) AS patrimonio_liquido
          FROM stg GROUP BY 1,2,3
        )
        SELECT p.*,
          COALESCE(mantidos,0)+COALESCE(rep_uniao,0)+COALESCE(rep_estados_df,0)
            +COALESCE(rep_municipios,0) AS estoque_ampliado,
          mantidos/NULLIF(ativo_total,0)        AS mantidos_sobre_ativos,
          mantidos/NULLIF(depositos_totais,0)   AS mantidos_sobre_depositos,
          mantidos/NULLIF(captacao_proxy,0)     AS mantidos_sobre_captacao,
          mantidos/NULLIF(patrimonio_liquido,0) AS mantidos_sobre_pl,
          (COALESCE(mantidos,0)+COALESCE(rep_uniao,0)+COALESCE(rep_estados_df,0)
            +COALESCE(rep_municipios,0))/NULLIF(patrimonio_liquido,0) AS ampliado_sobre_pl
        FROM pivo p
        WHERE mantidos IS NOT NULL OR rep_uniao IS NOT NULL
           OR rep_estados_df IS NOT NULL OR rep_municipios IS NOT NULL
        ORDER BY data_base, mantidos DESC NULLS LAST
    """).df()
    # estoque_ampliado só faz sentido se houver algum componente; manter NULL onde tudo é NULL já filtrado
    ind = ind.merge(
        dim_banco[["cnpj_raiz", "tipo_controle", "segmento_prudencial", "uf_sede", "nome_curto"]],
        on="cnpj_raiz", how="left")
    ind.to_csv(config.MARTS_DIR / "fact_indicador_bancario.csv", index=False)

    # ---- crescimento 3/12/24 meses do saldo mantido ----
    ind["data_base"] = ind["data_base"].astype(str)
    piv = ind.pivot_table(index="cnpj_raiz", columns="data_base", values="mantidos", aggfunc="first")

    def growth(row, months_back, all_dates):
        res = {}
        for d in all_dates:
            y, mo = int(d[:4]), int(d[4:])
            total = y * 12 + (mo - 1) - months_back
            prev = f"{total // 12:04d}{total % 12 + 1:02d}"
            cur_v = row.get(d)
            prev_v = row.get(prev)
            res[d] = (cur_v / prev_v - 1) if (pd.notna(cur_v) and pd.notna(prev_v) and prev_v) else None
        return res

    all_dates = sorted(piv.columns)
    growth_rows = []
    for cnpj, row in piv.iterrows():
        g3 = growth(row, 3, all_dates)
        g12 = growth(row, 12, all_dates)
        for d in all_dates:
            if pd.notna(row.get(d)):
                growth_rows.append({"cnpj_raiz": cnpj, "data_base": d,
                                    "cresc_3m": g3[d], "cresc_12m": g12[d]})
    pd.DataFrame(growth_rows).to_csv(config.MARTS_DIR / "fact_crescimento.csv", index=False)

    # ---- mart_nacional: os três conceitos + concentração, por mês ----
    nac = con.execute("""
        WITH m AS (
          SELECT data_base,
            SUM(CASE WHEN conta='4155000009' THEN saldo END) AS mantidos_total,
            SUM(CASE WHEN conta='9090700005' THEN saldo END) AS rep_uniao,
            SUM(CASE WHEN conta='9090800008' THEN saldo END) AS rep_estados_df,
            SUM(CASE WHEN conta='9090900001' THEN saldo END) AS rep_municipios,
            COUNT(DISTINCT CASE WHEN conta='4155000009' AND saldo IS NOT NULL
                                THEN cnpj_raiz END) AS n_instituicoes_mantidos
          FROM stg GROUP BY 1
        )
        SELECT *,
          COALESCE(rep_uniao,0)+COALESCE(rep_estados_df,0)+COALESCE(rep_municipios,0) AS repassado_total,
          COALESCE(mantidos_total,0)+COALESCE(rep_uniao,0)+COALESCE(rep_estados_df,0)
            +COALESCE(rep_municipios,0) AS estoque_ampliado
        FROM m ORDER BY data_base
    """).df()

    # concentração sobre o saldo mantido
    conc_rows = []
    for d, grp in ind.groupby("data_base"):
        g = grp.dropna(subset=["mantidos"]).sort_values("mantidos", ascending=False)
        tot = g["mantidos"].sum()
        if tot <= 0:
            continue
        shares = g["mantidos"] / tot
        conc_rows.append({
            "data_base": d,
            "cr1": shares.iloc[:1].sum(), "cr2": shares.iloc[:2].sum(),
            "cr5": shares.iloc[:5].sum(),
            "hhi": float((shares ** 2).sum() * 10000),
            "n_instituicoes": len(g),
        })
    conc = pd.DataFrame(conc_rows)
    nac = nac.merge(conc, on="data_base", how="left")
    nac.to_csv(config.MARTS_DIR / "mart_nacional.csv", index=False)

    # ---- instituições ausentes na última data-base ----
    last = max(ind["data_base"])
    hist = ind[ind["mantidos"].notna() & (ind["mantidos"] > 0)]
    universe = set(hist["cnpj_raiz"])
    present_last = set(ind[(ind["data_base"] == last) & ind["mantidos"].notna()]["cnpj_raiz"])
    ausentes = []
    for cnpj in sorted(universe - present_last):
        h = hist[hist["cnpj_raiz"] == cnpj].sort_values("data_base")
        lastrow = h.iloc[-1]
        ausentes.append({
            "cnpj_raiz": cnpj, "nome_instituicao": lastrow["nome_instituicao"],
            "ultima_data_base": lastrow["data_base"],
            "ultimo_saldo_mantidos": lastrow["mantidos"],
            "ultimo_estoque_ampliado": lastrow["estoque_ampliado"],
            "data_base_referencia": last,
            "observacao": "Instituicao sem balancete publicado nesta data-base. "
                          "Valor NAO somado ao total nacional (datas distintas).",
        })
    pd.DataFrame(ausentes).to_csv(config.MARTS_DIR / "mart_instituicoes_ausentes.csv", index=False)

    # ---- red flags ----
    build_red_flags(ind, pd.DataFrame(growth_rows), pd.DataFrame(ausentes), last)

    print(f"[marts] concluido. Ultima data-base: {last}. "
          f"Instituicoes ausentes na ultima base: {len(ausentes)}")


def build_red_flags(ind: pd.DataFrame, growth: pd.DataFrame,
                    ausentes: pd.DataFrame, last: str) -> None:
    """Red flag é sinal para investigação, não prova de irregularidade."""
    R = config.RED_FLAG_RULES
    flags = []

    def add(cnpj, nome, regra, valor, limiar, explicacao, materialidade,
            data_base, fonte="BCB balancete doc. 4010"):
        flags.append({
            "cnpj_raiz": cnpj, "nome_instituicao": nome, "regra": regra,
            "valor_observado": valor, "limiar": limiar, "explicacao": explicacao,
            "materialidade": materialidade, "data_base": data_base, "fonte": fonte,
            "status_apuracao": "sinal_para_investigacao",
            "aviso": "Red flag e sinal para investigacao e nao prova de irregularidade.",
        })

    cur = ind[ind["data_base"] == last]
    g = growth.merge(ind[["cnpj_raiz", "data_base", "nome_instituicao"]],
                     on=["cnpj_raiz", "data_base"], how="left")
    gcur = g[g["data_base"] == last]

    for _, r in gcur.iterrows():
        if pd.notna(r["cresc_12m"]) and r["cresc_12m"] > R["crescimento_12m"]:
            add(r["cnpj_raiz"], r["nome_instituicao"], "crescimento_12m",
                round(float(r["cresc_12m"]), 4), R["crescimento_12m"],
                "Crescimento do saldo mantido superior a 50% em 12 meses.",
                "media", last)
        if pd.notna(r["cresc_3m"]) and r["cresc_3m"] < R["queda_brusca_3m"]:
            add(r["cnpj_raiz"], r["nome_instituicao"], "queda_brusca_3m",
                round(float(r["cresc_3m"]), 4), R["queda_brusca_3m"],
                "Reducao superior a 30% do saldo mantido em 3 meses.",
                "media", last)

    for _, r in cur.iterrows():
        if pd.notna(r["mantidos_sobre_captacao"]) and pd.notna(r["mantidos"]) \
                and r["mantidos"] > config.LIMIAR_RANKING \
                and r["mantidos_sobre_captacao"] > R["mantidos_sobre_captacao"]:
            add(r["cnpj_raiz"], r["nome_instituicao"], "mantidos_sobre_captacao",
                round(float(r["mantidos_sobre_captacao"]), 4), R["mantidos_sobre_captacao"],
                "Depositos judiciais mantidos representam parcela relevante da captacao "
                "(dependencia de funding). Medida de escala, nao estimativa de perda.",
                "alta", last)
        if pd.notna(r["ampliado_sobre_pl"]) and r["ampliado_sobre_pl"] > R["ampliado_sobre_pl"]:
            add(r["cnpj_raiz"], r["nome_instituicao"], "ampliado_sobre_pl",
                round(float(r["ampliado_sobre_pl"]), 4), R["ampliado_sobre_pl"],
                "Estoque ampliado (mantido + repassado) superior a 3x o patrimonio liquido. "
                "Medida de escala e concentracao, nao estimativa automatica de perda.",
                "media", last)

    for _, r in ausentes.iterrows():
        add(r["cnpj_raiz"], r["nome_instituicao"], "ausencia_ultima_base",
            None, None,
            f"Instituicao ausente do balancete publico desde {r['ultima_data_base']}. "
            "Possivel atraso de demonstracoes/balancetes — verificar razao junto a "
            "fontes primarias.", "alta", last)
        # Para ausentes, avaliar os indicadores de razao na ULTIMA base disponivel
        # da propria instituicao (dado defasado — sinal adicional, nao comparavel
        # em data com as demais).
        h = ind[(ind["cnpj_raiz"] == r["cnpj_raiz"]) & ind["mantidos"].notna()] \
            .sort_values("data_base")
        if h.empty:
            continue
        lr = h.iloc[-1]
        sufixo = (f" Dado defasado: ultima base disponivel da instituicao "
                  f"({lr['data_base']}), anterior a {last}.")
        if pd.notna(lr["mantidos_sobre_captacao"]) \
                and lr["mantidos_sobre_captacao"] > R["mantidos_sobre_captacao"]:
            add(r["cnpj_raiz"], r["nome_instituicao"], "mantidos_sobre_captacao",
                round(float(lr["mantidos_sobre_captacao"]), 4), R["mantidos_sobre_captacao"],
                "Depositos judiciais mantidos representam parcela relevante da captacao "
                "(dependencia de funding). Medida de escala, nao estimativa de perda."
                + sufixo, "alta", lr["data_base"])
        if pd.notna(lr["ampliado_sobre_pl"]) and lr["ampliado_sobre_pl"] > R["ampliado_sobre_pl"]:
            add(r["cnpj_raiz"], r["nome_instituicao"], "ampliado_sobre_pl",
                round(float(lr["ampliado_sobre_pl"]), 4), R["ampliado_sobre_pl"],
                "Estoque ampliado (mantido + repassado) superior a 3x o patrimonio liquido. "
                "Medida de escala e concentracao, nao estimativa automatica de perda."
                + sufixo, "alta", lr["data_base"])

    pd.DataFrame(flags).to_csv(config.MARTS_DIR / "mart_red_flags.csv", index=False)


if __name__ == "__main__":
    build_staging()
    build_marts()
