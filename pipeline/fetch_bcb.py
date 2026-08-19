# -*- coding: utf-8 -*-
"""
Coleta dos balancetes mensais do BCB (documento 4010, segmento Bancos).

- Baixa o .zip de cada data-base configurada em config.MONTHS;
- Calcula SHA-256 do arquivo bruto;
- Registra URL, data de download, tamanho e hash em data/sources/source_registry.csv;
- Mês ainda não publicado (HTTP 404) => status "nao_disponivel" (nunca zero);
- Arquivo já baixado com hash registrado não é re-baixado (cache local, use --force).
"""

import csv
import hashlib
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_registry() -> dict:
    reg_path = config.SOURCES_DIR / "source_registry.csv"
    rows = {}
    if reg_path.exists():
        with open(reg_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                rows[row["source_id"]] = row
    return rows


def save_registry(rows: dict) -> None:
    reg_path = config.SOURCES_DIR / "source_registry.csv"
    reg_path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "source_id", "tipo", "descricao", "url", "arquivo_local",
        "data_base", "data_download_utc", "tamanho_bytes", "sha256", "status",
    ]
    with open(reg_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for k in sorted(rows):
            w.writerow(rows[k])


def fetch_month(yyyymm: str, registry: dict, force: bool = False) -> str:
    source_id = f"bcb_4010_{yyyymm}"
    url = config.BCB_URL_TEMPLATE.format(yyyymm=yyyymm)
    dest = config.RAW_DIR / f"{yyyymm}BANCOS.csv.zip"
    dest.parent.mkdir(parents=True, exist_ok=True)

    if not force and dest.exists() and source_id in registry \
            and registry[source_id].get("status") == "ok" \
            and registry[source_id].get("sha256") == sha256_file(dest):
        print(f"[fetch] {yyyymm}: cache ok ({registry[source_id]['sha256'][:12]}…)")
        return "ok"

    print(f"[fetch] {yyyymm}: baixando {url}")
    try:
        r = requests.get(url, timeout=180)
    except requests.RequestException as exc:
        print(f"[fetch] {yyyymm}: ERRO de rede: {exc}")
        registry[source_id] = {
            "source_id": source_id, "tipo": "bcb_balancete_4010",
            "descricao": f"Balancete BCB doc. 4010 seg. Bancos {yyyymm}", "url": url,
            "arquivo_local": "", "data_base": yyyymm,
            "data_download_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "tamanho_bytes": "", "sha256": "", "status": "erro_rede",
        }
        return "erro_rede"

    if r.status_code == 404:
        print(f"[fetch] {yyyymm}: 404 — data-base ainda nao publicada (nao disponivel)")
        registry[source_id] = {
            "source_id": source_id, "tipo": "bcb_balancete_4010",
            "descricao": f"Balancete BCB doc. 4010 seg. Bancos {yyyymm}", "url": url,
            "arquivo_local": "", "data_base": yyyymm,
            "data_download_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "tamanho_bytes": "", "sha256": "", "status": "nao_disponivel",
        }
        return "nao_disponivel"

    r.raise_for_status()
    dest.write_bytes(r.content)
    digest = sha256_file(dest)
    registry[source_id] = {
        "source_id": source_id, "tipo": "bcb_balancete_4010",
        "descricao": f"Balancete BCB doc. 4010 seg. Bancos {yyyymm}", "url": url,
        "arquivo_local": str(dest.relative_to(config.ROOT)), "data_base": yyyymm,
        "data_download_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "tamanho_bytes": str(len(r.content)), "sha256": digest, "status": "ok",
    }
    print(f"[fetch] {yyyymm}: ok, {len(r.content):,} bytes, sha256={digest[:12]}…")
    return "ok"


def main(force: bool = False) -> None:
    registry = load_registry()
    results = {m: fetch_month(m, registry, force=force) for m in config.MONTHS}
    save_registry(registry)
    ok = [m for m, s in results.items() if s == "ok"]
    nd = [m for m, s in results.items() if s == "nao_disponivel"]
    err = [m for m, s in results.items() if s == "erro_rede"]
    print(f"[fetch] concluido: {len(ok)} ok, {len(nd)} nao disponiveis ({','.join(nd)})"
          + (f", {len(err)} erros de rede ({','.join(err)})" if err else ""))
    if err:
        sys.exit(2)


if __name__ == "__main__":
    main(force="--force" in sys.argv)
