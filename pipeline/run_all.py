# -*- coding: utf-8 -*-
"""Executa o pipeline completo: fetch -> staging/marts -> quality -> exports.
A execução é abortada (exit != 0) se qualquer ponto de controle falhar."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_bcb
import build_marts
import quality_checks
import export_outputs

if __name__ == "__main__":
    fetch_bcb.main(force="--force" in sys.argv)
    build_marts.build_staging()
    build_marts.build_marts()
    rc = quality_checks.main()
    if rc != 0:
        print("[run_all] ABORTADO: controle de qualidade INVALIDO — exports nao gerados.")
        sys.exit(rc)
    export_outputs.main()
    print("[run_all] concluido com sucesso.")
