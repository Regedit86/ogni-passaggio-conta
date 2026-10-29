"""Converte i CSV di tuttocampo in data/squadre.json per il sito.

Uso:  python scripts/converti_csv.py
Rilanciarlo ogni volta che i CSV vengono aggiornati.

I CSV sono separati da ';' e codificati UTF-8 con BOM. Se un file non ha la
colonna "Regione" la si ricava dalla mappa FILE_SENZA_REGIONE.
"""
import csv
import hashlib
import json
from datetime import date
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
FILE_CSV = [
    "squadre_italia_parziale_tuttocampo.csv",
    "squadre_veneto_tuttocampo.csv",
]
FILE_SENZA_REGIONE = {"squadre_veneto_tuttocampo.csv": "Veneto"}
ORDINE_CATEGORIE = ["Eccellenza", "Promozione", "Prima Categoria", "Seconda Categoria", "Terza Categoria"]


def pulisci_email(valore: str) -> str:
    return (valore or "").strip().lower()


def id_squadra(r: dict) -> str:
    chiave = "|".join([r["regione"], r["categoria"], r["girone"], r["societa"]]).lower()
    return hashlib.sha1(chiave.encode("utf-8")).hexdigest()[:10]


def leggi(nome: str) -> list[dict]:
    percorso = RADICE / nome
    with percorso.open(encoding="utf-8-sig", newline="") as f:
        righe = list(csv.DictReader(f, delimiter=";"))
    out = []
    for riga in righe:
        r = {
            "regione": (riga.get("Regione") or FILE_SENZA_REGIONE.get(nome, "")).strip(),
            "categoria": (riga.get("Categoria") or "").strip(),
            "girone": (riga.get("Girone") or "").strip(),
            "societa": (riga.get("Società") or "").strip(),
            "provincia": (riga.get("Provincia") or "").strip(),
            "sede": (riga.get("Sede") or "").strip(),
            "telefono": (riga.get("Telefono") or "").strip(),
            "email": pulisci_email(riga.get("Email")),
            "email2": pulisci_email(riga.get("Email secondaria")),
            "sito": (riga.get("Sito") or "").strip(),
            "scheda": (riga.get("Scheda tuttocampo") or "").strip(),
        }
        if r["email2"] == r["email"]:
            r["email2"] = ""
        r["id"] = id_squadra(r)
        out.append(r)
    return out


def main() -> None:
    squadre, visti = [], set()
    for nome in FILE_CSV:
        for r in leggi(nome):
            if r["id"] in visti:
                continue
            visti.add(r["id"])
            squadre.append(r)

    squadre.sort(key=lambda r: (r["regione"], ORDINE_CATEGORIE.index(r["categoria"]) if r["categoria"] in ORDINE_CATEGORIE else 99, r["girone"], r["societa"]))
    regioni = sorted({r["regione"] for r in squadre})
    categorie = [c for c in ORDINE_CATEGORIE if any(r["categoria"] == c for r in squadre)]
    categorie += sorted({r["categoria"] for r in squadre} - set(categorie))

    dati = {
        "aggiornato": date.today().isoformat(),
        "regioni": regioni,
        "categorie": categorie,
        "squadre": squadre,
    }
    destinazione = RADICE / "data" / "squadre.json"
    destinazione.parent.mkdir(exist_ok=True)
    destinazione.write_text(json.dumps(dati, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    con_email = sum(1 for r in squadre if r["email"])
    uniche = len({r["email"] for r in squadre if r["email"]})
    print(f"{len(squadre)} squadre, {con_email} con email, {uniche} email uniche -> {destinazione}")


if __name__ == "__main__":
    main()
