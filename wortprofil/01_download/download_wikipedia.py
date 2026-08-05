"""
Wikipedia (dewiki) – Dump-Download + wikiextractor-Extraktion
Quelle: dumps.wikimedia.org/dewiki/latest | Lizenz: CC BY-SA 4.0

Fuer BEIDE Datenbanken (belege_v2 und wortprofil_v2). Die urspruengliche
F1-Entscheidung (2026-07-22) lautete "nur belege"; sie wurde am 2026-07-24 nach
dem Phase-C-A/B-Test revidiert (+39 % Kollokationen, +33 % Lemmata) – wikipedia.jsonl
steht seitdem auch in parse_deps_v2.DATEIEN.

Ablauf:
  1. dewiki-latest-pages-articles.xml.bz2 herunterladen (~7,3 GB, Resume via
     HTTP-Range, da der Download Stunden dauern kann).
  2. wikiextractor darüber laufen lassen (Befehl aus wortprofil/CLAUDE.md,
     Ausgabe als <doc id=... url=... title=...>Text</doc>-Blöcke).
  3. Die eigentliche Umwandlung nach 02_parsed_v2/wikipedia.jsonl passiert in
     02_parse/extract_text.py (Filterung Fließtext/Stubs, ref-Bildung).

Aufruf:
  python download_wikipedia.py                  # Download + Extraktion
  python download_wikipedia.py --download-only   # nur Download (Resume-fähig)
  python download_wikipedia.py --extract-only     # nur wikiextractor (Dump muss vorhanden sein)
  python download_wikipedia.py --dry-run          # nur anzeigen, nichts tun
"""

import argparse
import io
import subprocess
import sys
import time
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import requests  # noqa: E402  (nach stdout-Wrapper, wie in den anderen download_*.py)

DUMP_URL = "https://dumps.wikimedia.org/dewiki/latest/dewiki-latest-pages-articles.xml.bz2"
ZIEL = Path(__file__).parent / "korpora" / "wikipedia"
DUMP_DATEI = ZIEL / "dewiki-latest-pages-articles.xml.bz2"
EXTRACT_DIR = ZIEL / "extracted"
EXTRACT_MARKER = EXTRACT_DIR / ".done"

HEADERS = {
    # dumps.wikimedia.org blockt die Standard-requests-UA (403); eine
    # aussagekräftige UA gemäß Wikimedia-Download-Policy verwenden.
    "User-Agent": "Signifikation-Wortprofil/1.0 (Bildungsprojekt; "
                  "https://signifikation.de; joscha.fresmann@yahoo.de)"
}

CHUNK = 1024 * 1024          # 1 MB pro Read
LOG_ALLE = 200 * 1024 * 1024  # Fortschritt alle 200 MB loggen
MAX_VERSUCHE = 8              # Resume-Versuche bei Verbindungsabbruch
RETRY_PAUSE = 15              # Sekunden zwischen Versuchen


def _menschlich(bytes_zahl: float) -> str:
    for einheit in ("B", "KB", "MB", "GB", "TB"):
        if bytes_zahl < 1024:
            return f"{bytes_zahl:.1f} {einheit}"
        bytes_zahl /= 1024
    return f"{bytes_zahl:.1f} PB"


def remote_kennung() -> tuple[int, str]:
    """(Content-Length, ETag/Last-Modified) der Datei hinter DUMP_URL.
    „latest" ist ein Symlink, der während eines Stunden-Downloads auf einen
    neuen Dump umgebogen werden könnte – die Kennung erkennt das, damit wir
    nicht altes+neues Gemisch aneinanderhängen (siehe ETAG_DATEI unten)."""
    r = requests.head(DUMP_URL, headers=HEADERS, timeout=30, allow_redirects=True)
    r.raise_for_status()
    kennung = r.headers.get("ETag") or r.headers.get("Last-Modified") or ""
    return int(r.headers.get("Content-Length", 0)), kennung


def download_dump(dry_run: bool) -> bool:
    """Lädt den Dump mit Resume (HTTP-Range). Gibt True zurück, wenn die
    Datei danach vollständig und korrekt groß ist."""
    ZIEL.mkdir(parents=True, exist_ok=True)
    print(f"Ziel: {DUMP_DATEI}")
    etag_datei = DUMP_DATEI.with_suffix(DUMP_DATEI.suffix + ".etag")

    print("Prüfe Dateigröße auf dumps.wikimedia.org ...")
    gesamt, kennung = remote_kennung()
    if gesamt <= 0:
        print("  [FEHLER] Server liefert keine Content-Length (Range-Resume nicht möglich).")
        return False
    print(f"  Gesamtgröße: {_menschlich(gesamt)} ({gesamt:,} Bytes)")

    vorhanden = DUMP_DATEI.stat().st_size if DUMP_DATEI.exists() else 0
    alte_kennung = etag_datei.read_text(encoding="utf-8").strip() if etag_datei.exists() else ""
    if vorhanden and kennung and alte_kennung and kennung != alte_kennung:
        # "latest" wurde während einer früheren Sitzung auf einen neuen Dump
        # umgebogen – Teildatei passt nicht mehr zum aktuellen Ziel, neu starten
        # statt altes+neues Gemisch aneinanderzuhängen.
        print(f"  [WARNUNG] Remote-Datei hat sich geändert (neuer Dump-Stand) – "
              f"Teildatei ({_menschlich(vorhanden)}) wird verworfen, Download startet neu.")
        DUMP_DATEI.unlink(missing_ok=True)
        vorhanden = 0
    if kennung:
        etag_datei.write_text(kennung, encoding="utf-8")

    if vorhanden >= gesamt > 0:
        print("  [OK] Datei bereits vollständig vorhanden – kein Download nötig.")
        return True
    if vorhanden:
        print(f"  Teildatei gefunden: {_menschlich(vorhanden)} – setze Download fort ...")

    if dry_run:
        print(f"  [dry-run] würde {_menschlich(gesamt - vorhanden)} laden")
        return False

    versuch = 0
    t_start = time.time()
    while vorhanden < gesamt:
        versuch += 1
        if versuch > MAX_VERSUCHE:
            print(f"  [FEHLER] {MAX_VERSUCHE} Versuche ohne Erfolg – Abbruch. "
                  "Skript erneut aufrufen, um fortzusetzen.")
            return False
        try:
            headers = dict(HEADERS)
            if vorhanden:
                headers["Range"] = f"bytes={vorhanden}-"
            with requests.get(DUMP_URL, headers=headers, stream=True, timeout=60) as r:
                if vorhanden and r.status_code == 200:
                    # Server unterstützt hier kein Range → von vorn beginnen.
                    print("  [WARNUNG] Server ignoriert Range-Header, starte neu.")
                    vorhanden = 0
                    modus = "wb"
                elif r.status_code in (200, 206):
                    modus = "ab" if vorhanden else "wb"
                else:
                    r.raise_for_status()
                    modus = "wb"

                letzter_log = vorhanden
                t_versuch = time.time()
                with DUMP_DATEI.open(modus) as f:
                    for stueck in r.iter_content(chunk_size=CHUNK):
                        if not stueck:
                            continue
                        f.write(stueck)
                        vorhanden += len(stueck)
                        if vorhanden - letzter_log >= LOG_ALLE:
                            dt = max(time.time() - t_versuch, 0.001)
                            rate = (vorhanden - letzter_log) / dt / 1e6
                            pct = 100 * vorhanden / gesamt
                            print(f"  {_menschlich(vorhanden)} / {_menschlich(gesamt)} "
                                  f"({pct:.1f} %) · {rate:.1f} MB/s", flush=True)
                            letzter_log = vorhanden
                            t_versuch = time.time()
            versuch = 0  # erfolgreicher Durchlauf ohne Abbruch → Zähler zurücksetzen
        except (requests.exceptions.RequestException, ConnectionError) as e:
            print(f"  [ABBRUCH] {e} – warte {RETRY_PAUSE}s, dann Resume-Versuch "
                  f"{versuch}/{MAX_VERSUCHE} ...")
            time.sleep(RETRY_PAUSE)
            vorhanden = DUMP_DATEI.stat().st_size if DUMP_DATEI.exists() else 0

    dt_gesamt = time.time() - t_start
    print(f"  [OK] Download abgeschlossen in {dt_gesamt / 3600:.1f} h "
          f"({_menschlich(gesamt)}).")
    return True


def extrahiere(dry_run: bool) -> bool:
    """Ruft wikiextractor auf den heruntergeladenen Dump auf (Befehl aus
    wortprofil/CLAUDE.md). Ausgabe: EXTRACT_DIR/AA/wiki_00 usw. mit
    <doc id=... url=... title=...>Text</doc>-Blöcken."""
    if not DUMP_DATEI.exists():
        print(f"  [FEHLER] {DUMP_DATEI} nicht gefunden – erst downloaden.")
        return False
    if EXTRACT_MARKER.exists():
        print(f"  [SKIP] {EXTRACT_DIR} bereits extrahiert (Marker vorhanden).")
        return True

    EXTRACT_DIR.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable, "-m", "wikiextractor.WikiExtractor",
        str(DUMP_DATEI), "-o", str(EXTRACT_DIR),
    ]
    print("wikiextractor-Aufruf:", " ".join(cmd))
    if dry_run:
        print("  [dry-run] würde wikiextractor starten")
        return False

    t0 = time.time()
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, encoding="utf-8", errors="replace")
    for zeile in proc.stdout:
        print(f"  [wikiextractor] {zeile.rstrip()}", flush=True)
    rc = proc.wait()
    if rc != 0:
        print(f"  [FEHLER] wikiextractor beendet mit Code {rc}")
        return False

    EXTRACT_MARKER.write_text(f"fertig nach {time.time() - t0:.0f}s\n", encoding="utf-8")
    print(f"  [OK] Extraktion abgeschlossen in {(time.time() - t0) / 60:.1f} min "
          f"→ {EXTRACT_DIR}")
    return True


def main():
    parser = argparse.ArgumentParser(description="Wikipedia dewiki – Download + wikiextractor")
    parser.add_argument("--download-only", action="store_true", help="Nur Download")
    parser.add_argument("--extract-only", action="store_true", help="Nur wikiextractor")
    parser.add_argument("--dry-run", action="store_true", help="Nur anzeigen, nichts tun")
    args = parser.parse_args()

    print("=== Wikipedia (dewiki) – Download + Extraktion ===")

    if not args.extract_only:
        ok = download_dump(args.dry_run)
        if not ok and not args.dry_run:
            sys.exit(1)

    if not args.download_only:
        ok = extrahiere(args.dry_run)
        if not ok and not args.dry_run:
            sys.exit(1)

    print("\n=== Fertig ===")
    print(f"Dump:      {DUMP_DATEI}")
    print(f"Extrahiert: {EXTRACT_DIR}")
    print("Nächster Schritt: python ../02_parse/extract_text.py --only wikipedia")


if __name__ == "__main__":
    main()
