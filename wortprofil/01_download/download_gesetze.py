"""
Gesetze im Internet – Bulk-Download aller Gesetze als XML
Quelle: www.gesetze-im-internet.de | Lizenz: Public Domain

Ablauf:
  1. Inhaltsverzeichnis-XML laden (gii-toc.xml)
  2. Alle Gesetzes-Slugs extrahieren
  3. Für jedes Gesetz: xml.zip herunterladen + entpacken

Aufruf: python download_gesetze.py [--dry-run] [--limit N]
"""

import argparse
import io
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ZIEL      = Path(__file__).parent / "korpora" / "gesetze"
TOC_URL   = "https://www.gesetze-im-internet.de/gii-toc.xml"
BASIS_URL = "https://www.gesetze-im-internet.de"
PAUSE     = 0.3   # Sekunden zwischen Requests (Server schonen)
HEADERS   = {"User-Agent": "Mozilla/5.0 (compatible; Signifikation-Wortprofil/1.0; Bildungsprojekt)"}

ZIEL.mkdir(parents=True, exist_ok=True)


def lade_toc() -> list[tuple[str, str]]:
    """Gibt Liste von (slug, titel) zurück."""
    print(f"Lade Inhaltsverzeichnis: {TOC_URL}")
    req = urllib.request.Request(TOC_URL, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        inhalt = r.read()
    root = ET.fromstring(inhalt)
    # Schema: <items><item><link>/bgb/</link><title>Bürgerliches Gesetzbuch</title></item>...
    eintraege = []
    for item in root.iter("item"):
        link  = item.findtext("link", "").strip()
        # Link enthält z.B. "/bgb/xml.zip" → Slug ist das Verzeichnis davor: "bgb"
        teile = [t for t in urllib.parse.urlparse(link).path.split("/") if t and t != "xml.zip"]
        slug  = teile[-1] if teile else ""
        titel = item.findtext("title", "").strip()
        if slug:
            eintraege.append((slug, titel))
    print(f"  {len(eintraege)} Gesetze im Verzeichnis gefunden.")
    return eintraege


def download_gesetz(slug: str, titel: str, dry_run: bool) -> bool:
    ziel_dir = ZIEL / slug
    # Schon vorhanden?
    if ziel_dir.exists() and any(ziel_dir.iterdir()):
        return True  # skip

    url = f"{BASIS_URL}/{slug}/xml.zip"
    if dry_run:
        print(f"  [dry-run] {slug}: {url}")
        return True

    ziel_dir.mkdir(exist_ok=True)
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=20) as r:
            daten = r.read()
        with zipfile.ZipFile(io.BytesIO(daten)) as z:
            z.extractall(ziel_dir)
        return True
    except urllib.error.HTTPError as e:
        ziel_dir.rmdir() if ziel_dir.exists() and not any(ziel_dir.iterdir()) else None
        print(f"  [HTTP {e.code}] {slug}: {url}")
        return False
    except Exception as e:
        print(f"  [FEHLER] {slug}: {e}")
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0,
                        help="Nur N Gesetze herunterladen (zum Testen)")
    args = parser.parse_args()

    gesetze = lade_toc()
    if args.limit:
        gesetze = gesetze[:args.limit]

    print(f"\nStarte Download von {len(gesetze)} Gesetzen nach {ZIEL}\n")

    ok = fehler = bereits = 0
    for i, (slug, titel) in enumerate(gesetze, 1):
        ziel_dir = ZIEL / slug
        if ziel_dir.exists() and any(ziel_dir.iterdir()):
            bereits += 1
            continue

        erfolg = download_gesetz(slug, titel, args.dry_run)
        if erfolg:
            ok += 1
        else:
            fehler += 1

        # Fortschritt alle 50 Gesetze
        if i % 50 == 0 or i == len(gesetze):
            print(f"  [{i}/{len(gesetze)}] geladen: {ok}  bereits: {bereits}  fehler: {fehler}")

        if not args.dry_run:
            time.sleep(PAUSE)

    print(f"\nFertig. Geladen: {ok} | Bereits vorhanden: {bereits} | Fehler/404: {fehler}")
    print(f"Ablageort: {ZIEL}")


if __name__ == "__main__":
    main()
