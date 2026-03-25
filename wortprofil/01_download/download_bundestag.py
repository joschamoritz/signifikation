"""
Bundestagskorpus – Plenarprotokolle via DIP-API
Lizenz: Datenlizenz Deutschland BY 2.0 (auch kommerziell)

Voraussetzung: Kostenloser API-Key von https://dip.bundestag.de/über-dip/hilfe/api
  → Seite öffnen → "API-Key beantragen" → E-Mail-Adresse angeben → Key per Mail

Aufruf: python download_bundestag.py --key DEIN_API_KEY [--dry-run] [--ab 1949]
"""

import argparse
import io
import json
import sys
import time
import urllib.request
import urllib.parse
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ZIEL      = Path(__file__).parent / "korpora" / "bundestagskorpus"
API_BASE  = "https://search.dip.bundestag.de/api/v1"
PAUSE     = 0.5   # Sekunden zwischen API-Requests

ZIEL.mkdir(parents=True, exist_ok=True)


def api_get(endpoint: str, params: dict, apikey: str) -> dict:
    params["apikey"] = apikey
    params["format"] = "json"
    url = f"{API_BASE}/{endpoint}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read())


def download_datei(url: str, zieldatei: Path, dry_run: bool, fallback_url: str = "") -> bool:
    if zieldatei.exists():
        return True
    if dry_run:
        print(f"    [dry-run] {zieldatei.name}")
        return True
    try:
        urllib.request.urlretrieve(url, zieldatei)
        return True
    except urllib.error.HTTPError as e:
        if e.code == 404 and fallback_url:
            # XML nicht vorhanden → PDF als Fallback
            pdf_ziel = zieldatei.with_suffix(".pdf")
            try:
                urllib.request.urlretrieve(fallback_url, pdf_ziel)
                return True
            except urllib.error.HTTPError as e2:
                if e2.code == 404:
                    return False  # Noch nicht auf Server – still überspringen
                print(f"    [FEHLER] {zieldatei.stem}: {e2}")
                return False
            except Exception as e2:
                print(f"    [FEHLER] {zieldatei.stem}: {e2}")
                return False
        if e.code != 404:
            print(f"    [HTTP {e.code}] {zieldatei.name}")
        return False
    except Exception as e:
        print(f"    [FEHLER] {zieldatei.name}: {e}")
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--key",     default="OSOegLs.PR2lwJ1dwCeje9vTj7FPOt3hvpYKtwKkhw",
                        help="DIP API-Key")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--ab",      type=int, default=1949,
                        help="Ab Jahrgang (Standard: 1949)")
    parser.add_argument("--bis",     type=int, default=2026,
                        help="Bis Jahrgang (Standard: 2026)")
    args = parser.parse_args()

    print(f"Bundestagskorpus: Plenarprotokolle {args.ab}–{args.bis}")
    print(f"API-Key: {args.key[:8]}...\n")

    cursor  = None
    gesamt  = 0
    geladen = 0
    seite   = 0

    while True:
        seite += 1
        params = {
            "f.zuordnung":   "BT",
            "f.datum.start": f"{args.ab}-01-01",
            "f.datum.end":   f"{args.bis}-12-31",
            "num":           100,
        }
        if cursor:
            params["cursor"] = cursor

        try:
            data = api_get("plenarprotokoll", params, args.key)
        except Exception as e:
            print(f"[FEHLER] API-Anfrage fehlgeschlagen: {e}")
            break

        dokumente = data.get("documents", [])
        if not dokumente:
            break

        if seite == 1:
            gesamt = data.get("numFound", "?")
            print(f"Gefunden: {gesamt} Protokolle\n")

        for dok in dokumente:
            # Metadaten
            datum = dok.get("datum", "unbekannt")
            wp    = dok.get("wahlperiode", 0)
            nr    = dok.get("sitzungsnummer")
            # Sitzungsnummer kann None sein → aus dokumentnummer ableiten (z.B. "19/42" → 42)
            if nr is None:
                doknr = dok.get("dokumentnummer", "")
                nr = doknr.split("/")[-1] if "/" in doknr else "0"
            nr_str = str(nr).zfill(4) if str(nr).isdigit() else str(nr)
            # Windows-ungültige Zeichen aus Dateinamen entfernen
            titel = f"WP{int(wp):02d}_{nr_str}_{datum}"
            titel = titel.replace("?", "x").replace(":", "-").replace("/", "-").replace("\\", "-")

            # XML-URL aus PDF-URL ableiten (dserver.bundestag.de unterstützt beide)
            pdf_url = dok.get("fundstelle", {}).get("pdf_url", "")
            xml_url = pdf_url.replace(".pdf", ".xml") if pdf_url else ""
            url     = xml_url or pdf_url
            ext     = "xml" if xml_url else "pdf"

            if not url:
                continue

            zieldatei = ZIEL / f"{titel}.{ext}"
            fallback  = pdf_url if ext == "xml" else ""
            if download_datei(url, zieldatei, args.dry_run, fallback):
                geladen += 1

            if gesamt != "?" and geladen % 50 == 0:
                print(f"  [{geladen}/{gesamt}] heruntergeladen ...")

        neuer_cursor = data.get("cursor")
        if not neuer_cursor or neuer_cursor == cursor:
            break
        cursor = neuer_cursor

        if not args.dry_run:
            time.sleep(PAUSE)

    print(f"\nFertig. {geladen} Protokolle heruntergeladen.")
    print(f"Ablageort: {ZIEL}")


if __name__ == "__main__":
    main()
