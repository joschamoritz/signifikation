"""
Phase 1 – Korpora herunterladen
Aufruf: python download_korpora.py [--dry-run] [--only github|zenodo|leipzig]

Automatisch:   GitHub-Repos klonen, Zenodo-Dateien, Leipzig-Samples
Manuell nötig: Bundestagskorpus, DTA-Kernkorpus, DTA-Erweiterungen, Politische Reden
               (Hinweise werden am Ende ausgegeben)
"""

import argparse
import io
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

# Windows-Terminal: UTF-8 erzwingen
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE = Path(__file__).parent / "korpora"
BASE.mkdir(exist_ok=True)

# ── Korpora ────────────────────────────────────────────────────────────────

GITHUB_KORPORA = [
    {
        "name":    "humboldt-publizistik",
        "desc":    "A. v. Humboldts Publizistik (1790–1859)",
        "lizenz":  "CC BY-SA 4.0",
        "url":     "https://github.com/avh-bern-berlin/avh-texts.git",
        "groesse": "~200 MB",
    },
    {
        "name":    "jean-paul-briefe",
        "desc":    "Briefe von Jean Paul (1780–1825)",
        "lizenz":  "CC BY-SA 4.0",
        "url":     "https://github.com/telota/jean_paul_briefe.git",
        "groesse": "~150 MB",
    },
    {
        "name":    "humboldt-digital",
        "desc":    "Edition Humboldt digital (1780–1859)",
        "lizenz":  "CC BY-SA 4.0",
        "url":     "https://github.com/telota/edition-humboldt-digital.git",
        "groesse": "~100 MB",
    },
    {
        "name":    "dta-novellenschatz",
        "desc":    "Neuer Deutscher Novellenschatz (1884–1887)",
        "lizenz":  "CC BY-SA 4.0",
        "url":     "https://github.com/deutschestextarchiv/nschatz_deu.git",
        "groesse": "~50 MB",
    },
    {
        "name":    "dta-soldatenbriefe",
        "desc":    "Soldatenbriefe (1745–1872)",
        "lizenz":  "CC BY-SA 4.0",
        "url":     "https://github.com/deutschestextarchiv/soldatenbriefe.git",
        "groesse": "~30 MB",
    },
    {
        "name":    "dta-stimm-los",
        "desc":    "stimm-los – Wiedergefundene Perlen der Literatur",
        "lizenz":  "CC BY-SA 4.0",
        "url":     "https://github.com/deutschestextarchiv/stimm-los.git",
        "groesse": "~20 MB",
    },
    {
        "name":    "dta-patiententexte",
        "desc":    "Korpus Patiententexte (1834–1957)",
        "lizenz":  "CC BY-SA 4.0",
        "url":     "https://github.com/deutschestextarchiv/copadocs.git",
        "groesse": "~30 MB",
    },
    {
        "name":    "dta-dingler",
        "desc":    "Polytechnisches Journal (DTA)",
        "lizenz":  "CC BY-SA 4.0",
        "url":     "https://github.com/deutschestextarchiv/dingler.git",
        "groesse": "~200 MB",
    },
]

ZENODO_KORPORA = [
    {
        "name":       "gei-digital",
        "desc":       "GEI-Digital (1650–1921) – Schulbücher",
        "lizenz":     "CC0",
        "record_id":  "15729290",
        "groesse":    "~2–5 GB",
    },
    {
        "name":       "wikibooks",
        "desc":       "Wikibooks-Korpus (aktuell)",
        "lizenz":     "CC BY-SA 4.0",
        "record_id":  "8081095",
        "groesse":    "~500 MB",
    },
    {
        "name":       "wikivoyage",
        "desc":       "Wikivoyage-Korpus (aktuell)",
        "lizenz":     "CC BY-SA 4.0",
        "record_id":  "7568517",
        "groesse":    "~100 MB",
    },
    {
        "name":       "neuer-pitaval",
        "desc":       "Der Neue Pitaval (1842–1890)",
        "lizenz":     "CC BY-SA 4.0",
        "record_id":  "6682897",
        "groesse":    "~50 MB",
    },
    {
        "name":       "dibilit",
        "desc":       "DiBiLit-Korpus (TextGrid + GerDraCor + IDS i5 + Zeno.org)",
        "lizenz":     "CC BY-SA 4.0",
        "record_id":  "5786725",
        "groesse":    "~1–2 GB",
    },
]

# ── Leipzig Corpora Collection ─────────────────────────────────────────────
# Frei verfügbare Samples: max. 1 Mio. Sätze pro Jahrgang (~15 Mio. Tokens)
# URL-Muster: https://downloads.wortschatz-leipzig.de/corpora/{name}_{year}_1M.tar.gz
# Nicht vorhandene Jahre antworten mit HTTP 404 → werden automatisch übersprungen

LEIPZIG_BASE = "https://downloads.wortschatz-leipzig.de/corpora"
LEIPZIG_SIZE = "1M"  # größtes frei verfügbares Sample

LEIPZIG_KORPORA = [
    {
        "name":   "deu_news",
        "desc":   "Leipzig deu_news – Zeitungstexte",
        "lizenz": "CC BY",
        "jahre":  list(range(1995, 2026)),  # 1995–2025, nicht alle existieren
        "groesse_pro_jahr": "~15 Mio. Tokens",
    },
    {
        "name":   "deu_newscrawl",
        "desc":   "Leipzig deu_newscrawl – Nachrichtenportale",
        "lizenz": "CC BY",
        "jahre":  list(range(2011, 2021)),  # 2011–2020
        "groesse_pro_jahr": "~15 Mio. Tokens",
    },
]

# Manuelle Downloads – Hinweise für den Nutzer
MANUELL = [
    {
        "name":    "bundestagskorpus",
        "desc":    "Bundestagskorpus (1949–2017) – ~1–2 Mrd. Tokens",
        "lizenz":  "Datenlizenz Deutschland BY 2.0 (auch kommerziell)",
        "anweisung": (
            "1. https://www.bundestag.de/services/opendata aufrufen\n"
            "   → Abschnitt 'Plenarprotokolle' → alle Wahlperioden als XML herunterladen\n"
            "2. Dateien ablegen in:\n"
            f"   {BASE / 'bundestagskorpus'}\\"
        ),
    },
    {
        "name":    "dta-kern",
        "desc":    "DTA-Kernkorpus (1598–1913) – ~100–200 Mio. Tokens",
        "lizenz":  "CC BY-SA 4.0",
        "anweisung": (
            "1. https://www.deutschestextarchiv.de/download aufrufen\n"
            "   → 'DTA-Kernkorpus' → Format: TCF oder Plain Text herunterladen\n"
            "2. Dateien ablegen in:\n"
            f"   {BASE / 'dta-kern'}\\"
        ),
    },
    {
        "name":    "dta-erweiterungen",
        "desc":    "DTA-Erweiterungen (1465–1969) – ~300–500 Mio. Tokens",
        "lizenz":  "CC BY-SA 4.0",
        "anweisung": (
            "1. https://www.deutschestextarchiv.de/download aufrufen\n"
            "   → 'DTA-Erweiterungen' → Format: TCF oder Plain Text herunterladen\n"
            "2. Dateien ablegen in:\n"
            f"   {BASE / 'dta-erweiterungen'}\\"
        ),
    },
    {
        "name":    "politische-reden",
        "desc":    "Politische Reden (1982–2020) – ~30–80 Mio. Tokens",
        "lizenz":  "CC BY-SA 4.0",
        "anweisung": (
            "1. https://politische-reden.eu aufrufen → Downloadbereich suchen\n"
            "2. Dateien ablegen in:\n"
            f"   {BASE / 'politische-reden'}\\"
        ),
    },
    {
        "name":    "gesetze",
        "desc":    "Gesetze und Verordnungen (1897–2025)",
        "lizenz":  "Public Domain",
        "anweisung": (
            "1. https://www.gesetze-im-internet.de aufrufen\n"
            "   → ggf. Bulk-Download oder XML-Dump prüfen\n"
            "2. Dateien ablegen in:\n"
            f"   {BASE / 'gesetze'}\\"
        ),
    },
]

# ── Hilfsfunktionen ────────────────────────────────────────────────────────

def log(msg): print(f"  {msg}")
def ok(msg):  print(f"  [OK]    {msg}")
def err(msg): print(f"  [FEHLER] {msg}")
def skip(msg):print(f"  [SKIP]  {msg}")


def clone_github(korpus: dict, dry_run: bool):
    ziel = BASE / korpus["name"]
    print(f"\n── {korpus['desc']} ({korpus['lizenz']}, {korpus['groesse']})")
    if ziel.exists() and any(ziel.iterdir()):
        skip(f"Bereits vorhanden: {ziel}")
        return
    if dry_run:
        log(f"[dry-run] git clone {korpus['url']} {ziel}")
        return
    ziel.mkdir(exist_ok=True)
    log(f"Klone {korpus['url']} ...")
    try:
        result = subprocess.run(
            ["git", "clone", "--depth=1", "--progress", korpus["url"], str(ziel)],
            capture_output=False,   # Ausgabe direkt im Terminal sichtbar
            timeout=300             # 5 Minuten Timeout
        )
        if result.returncode == 0:
            ok(f"Geklont nach {ziel}")
        else:
            err(f"git clone fehlgeschlagen (Exit {result.returncode})")
    except subprocess.TimeoutExpired:
        err(f"Timeout nach 5 Minuten – überspringe {korpus['name']}")


def download_zenodo(korpus: dict, dry_run: bool):
    ziel = BASE / korpus["name"]
    print(f"\n── {korpus['desc']} ({korpus['lizenz']}, {korpus['groesse']})")
    if ziel.exists() and any(ziel.iterdir()):
        skip(f"Bereits vorhanden: {ziel}")
        return
    ziel.mkdir(exist_ok=True)

    api_url = f"https://zenodo.org/api/records/{korpus['record_id']}"
    log(f"Zenodo-Metadaten abrufen: {api_url}")
    if dry_run:
        log(f"[dry-run] würde Dateien von Zenodo Record {korpus['record_id']} herunterladen")
        return
    try:
        with urllib.request.urlopen(api_url, timeout=30) as r:
            meta = json.loads(r.read())
        dateien = meta.get("files", [])
        if not dateien:
            err("Keine Dateien in Zenodo-Record gefunden.")
            return
        for datei in dateien:
            name     = Path(datei["key"]).name  # Pfadteile aus key entfernen
            url      = datei["links"]["self"]
            groesse  = datei.get("size", 0)
            zieldatei = ziel / name
            if zieldatei.exists():
                skip(f"{name} bereits vorhanden")
                continue
            log(f"Lade {name} ({groesse / 1e6:.1f} MB) ...")
            urllib.request.urlretrieve(url, zieldatei)
            ok(f"{name} heruntergeladen")
    except Exception as e:
        err(f"Zenodo-Download fehlgeschlagen: {e}")


def download_leipzig(korpus: dict, dry_run: bool):
    print(f"\n── {korpus['desc']} ({korpus['lizenz']}, {korpus['groesse_pro_jahr']}/Jahr)")
    ziel_basis = BASE / korpus["name"]
    ziel_basis.mkdir(exist_ok=True)

    vorhanden = gefunden = nicht_gefunden = 0
    for jahr in korpus["jahre"]:
        dateiname  = f"{korpus['name']}_{jahr}_{LEIPZIG_SIZE}.tar.gz"
        zieldatei  = ziel_basis / dateiname
        url        = f"{LEIPZIG_BASE}/{dateiname}"

        if zieldatei.exists():
            vorhanden += 1
            continue
        if dry_run:
            log(f"[dry-run] {dateiname}")
            gefunden += 1
            continue
        try:
            req = urllib.request.Request(url, method="HEAD")
            urllib.request.urlopen(req, timeout=10)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                nicht_gefunden += 1
                continue
            err(f"{dateiname}: HTTP {e.code}")
            continue
        except Exception as e:
            err(f"{dateiname}: {e}")
            continue

        log(f"Lade {dateiname} ...")
        try:
            urllib.request.urlretrieve(url, zieldatei)
            gefunden += 1
            ok(f"{dateiname}")
        except Exception as e:
            err(f"{dateiname}: {e}")

    if dry_run:
        log(f"Würde ~{gefunden} Jahrgänge herunterladen, {nicht_gefunden} nicht vorhanden")
    else:
        ok(f"{gefunden} Jahrgänge geladen, {vorhanden} bereits vorhanden, "
           f"{nicht_gefunden} nicht verfügbar")


def zeige_manuelle_hinweise():
    print("\n" + "═" * 60)
    print("MANUELLE DOWNLOADS ERFORDERLICH")
    print("═" * 60)
    for k in MANUELL:
        ziel = BASE / k["name"]
        ziel.mkdir(exist_ok=True)
        print(f"\n▶ {k['desc']}")
        print(f"  Lizenz: {k['lizenz']}")
        print(f"  {k['anweisung']}")


# ── Hauptprogramm ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Korpora herunterladen")
    parser.add_argument("--dry-run", action="store_true",
                        help="Nur anzeigen was passieren würde, nichts herunterladen")
    parser.add_argument("--only", choices=["github", "zenodo", "leipzig"],
                        help="Nur eine Quellart herunterladen")
    args = parser.parse_args()

    if args.dry_run:
        print("=== DRY-RUN: Es wird nichts heruntergeladen ===\n")

    if args.only not in ("zenodo", "leipzig"):
        print("\n=== GitHub-Repos ===")
        for k in GITHUB_KORPORA:
            clone_github(k, args.dry_run)

    if args.only not in ("github", "leipzig"):
        print("\n=== Zenodo-Korpora ===")
        for k in ZENODO_KORPORA:
            download_zenodo(k, args.dry_run)

    if args.only not in ("github", "zenodo"):
        print("\n=== Leipzig Corpora Collection ===")
        print("    (Samples: 1 Mio. Sätze/Jahr, CC BY, nicht vorhandene Jahre werden übersprungen)")
        for k in LEIPZIG_KORPORA:
            download_leipzig(k, args.dry_run)

    zeige_manuelle_hinweise()

    print("\n=== Fertig ===")
    print(f"Korpora-Verzeichnis: {BASE}")


if __name__ == "__main__":
    main()
