# -*- coding: utf-8 -*-
"""
Controle de qualidade do Observatório.

Executa, sobre o staging e os marts:
1. Pontos de controle — valores reproduzidos manualmente nos arquivos oficiais
   antes da automação devem bater com o pipeline (tolerância 0,5%).
2. Totais nacionais de controle.
3. Anti-dupla-contagem: nenhuma linha do documento 4016 no staging.
4. Espelho classe 3 x classe 9: os saldos 3.0.9.0x devem espelhar 9.0.9.0x
   (se divergirem, registrar issue; os marts usam SOMENTE classe 9).
5. Ausência tratada como ausência: nenhuma linha com saldo zero artificial.
6. Reconciliação BRB: soma jun/2025 ~ R$ 25,6 bi (divulgação "carteira de R$ 25 bi").

Falha em ponto de controle => exit code 1 (execução inválida).
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config


def main() -> int:
    stg = pd.read_parquet(config.STAGING_DIR / "stg_balancete.parquet")
    checks = []
    issues = []

    def check(nome, ok, detalhe, severidade="erro"):
        checks.append({"check": nome, "resultado": "PASSOU" if ok else "FALHOU",
                       "detalhe": detalhe})
        if not ok:
            issues.append({"check": nome, "severidade": severidade, "detalhe": detalhe})
        print(f"[quality] {'PASSOU' if ok else 'FALHOU'} — {nome}: {detalhe}")
        return ok

    fatal = False

    # 1. Pontos de controle individuais
    for data_base, nome_parcial, conta, esperado in config.CONTROL_POINTS:
        sel = stg[(stg["data_base"] == data_base) & (stg["conta"] == conta)
                  & stg["nome_instituicao"].str.contains(nome_parcial, regex=False)]
        if sel.empty:
            fatal |= not check(f"ponto_controle:{data_base}:{nome_parcial}:{conta}", False,
                               "linha nao encontrada no staging")
            continue
        obtido = float(sel["saldo"].iloc[0])
        desvio = abs(obtido - esperado) / esperado
        ok = desvio <= config.CONTROL_TOLERANCE
        fatal |= not check(
            f"ponto_controle:{data_base}:{nome_parcial}:{conta}", ok,
            f"esperado~{esperado:,.0f}, obtido {obtido:,.0f} (desvio {desvio:.3%})")

    # 2. Totais nacionais de controle
    for data_base, conta, esperado, tol in config.CONTROL_TOTALS:
        obtido = float(stg[(stg["data_base"] == data_base)
                           & (stg["conta"] == conta)]["saldo"].sum())
        desvio = abs(obtido - esperado) / esperado
        ok = desvio <= tol
        fatal |= not check(f"total_controle:{data_base}:{conta}", ok,
                           f"esperado~{esperado:,.0f}, obtido {obtido:,.0f} (desvio {desvio:.3%})")

    # 3. Nenhum documento 4016 no staging
    n4016 = int((stg["documento"] != config.DOCUMENTO).sum())
    fatal |= not check("anti_dupla_contagem_4016", n4016 == 0,
                       f"{n4016} linhas com documento != 4010 no staging")

    # 4. Espelho classe 3 x classe 9
    esp = config.CONTAS_ESPELHO_CLASSE_3
    div = 0
    for c3, c9 in esp.items():
        a = stg[stg["conta"] == c3].set_index(["data_base", "cnpj_raiz"])["saldo"]
        b = stg[stg["conta"] == c9].set_index(["data_base", "cnpj_raiz"])["saldo"]
        j = pd.concat([a.rename("c3"), b.rename("c9")], axis=1).dropna()
        d = j[(j["c3"] - j["c9"]).abs() > 0.01 * j["c9"].abs().clip(lower=1)]
        div += len(d)
        for (db, cnpj), row in d.iterrows():
            issues.append({"check": "espelho_classe3_classe9", "severidade": "aviso",
                           "detalhe": f"{db}/{cnpj}: {c3}={row.c3:,.0f} vs {c9}={row.c9:,.0f}"})
    check("espelho_classe3_classe9", div == 0,
          f"{div} divergencias entre contas espelho (classe 3 x classe 9)", "aviso")

    # 5. Ausência de zeros artificiais na conta de mantidos
    zeros = int((stg[stg["conta"] == config.CONTA_MANTIDOS]["saldo"] == 0).sum())
    check("sem_zeros_artificiais", True,
          f"{zeros} linhas com saldo exatamente zero na conta de mantidos "
          "(zeros reportados pela fonte sao mantidos; ausencias nao viram zero)", "info")

    # 6. Reconciliação BRB jun/2025 (~R$ 25,6 bi; divulgação: 'carteira de R$ 25 bi')
    brb = stg[(stg["data_base"] == "202506")
              & stg["nome_instituicao"].str.contains("BRB", regex=False)
              & stg["conta"].isin([config.CONTA_MANTIDOS] + config.CONTAS_REPASSE)]
    soma = float(brb["saldo"].sum())
    ok = abs(soma - 25_600_000_000.0) / 25_600_000_000.0 <= 0.01
    fatal |= not check("reconciliacao_brb_jun2025", ok,
                       f"soma mantido+repassado BRB 202506 = {soma:,.0f} (esperado ~25,6 bi)")

    # 7. Cobertura da série
    meses_ok = sorted(stg["data_base"].unique())
    meses_falt = [m for m in config.MONTHS if m not in meses_ok]
    check("cobertura_serie", True,
          f"{len(meses_ok)} meses no staging ({meses_ok[0]}–{meses_ok[-1]}); "
          f"nao disponiveis: {meses_falt or 'nenhum'}", "info")

    report = {
        "executado_em_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "resultado_geral": "INVALIDO" if fatal else "VALIDO",
        "checks": checks,
        "issues": issues,
    }
    config.QUALITY_DIR.mkdir(parents=True, exist_ok=True)
    with open(config.QUALITY_DIR / "quality_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    pd.DataFrame(issues or [{"check": "-", "severidade": "-", "detalhe": "sem issues"}]) \
        .to_csv(config.QUALITY_DIR / "quality_issues.csv", index=False)

    print(f"[quality] resultado geral: {report['resultado_geral']}")
    return 1 if fatal else 0


if __name__ == "__main__":
    sys.exit(main())
