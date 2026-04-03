"""
Lädt wortprofil.db in Chunks zur Railway-Admin-API hoch.

Aufruf:
    python upload_wortprofil.py --url https://DEINE-URL.railway.app --token ADMIN_TOKEN
"""
import argparse
import math
import sys
import json
from pathlib import Path
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

DB_PATH   = Path(__file__).parent / "wortprofil" / "05_db" / "wortprofil.db"
CHUNK_MB  = 2  # MB pro Chunk

def upload(url: str, token: str, start_from: int = 0):
    session = requests.Session()
    retry = Retry(total=5, backoff_factor=3, status_forcelist=[502, 503, 504])
    session.mount("https://", HTTPAdapter(max_retries=retry))

    db_bytes = DB_PATH.read_bytes()
    size     = len(db_bytes)
    chunk    = CHUNK_MB * 1024 * 1024
    total    = math.ceil(size / chunk)
    print(f"Datei: {DB_PATH}  ({size / 1e6:.1f} MB)")
    print(f"Chunks: {total} × {CHUNK_MB} MB  (ab Index {start_from})")

    for i in range(start_from, total):
        part = db_bytes[i * chunk : (i + 1) * chunk]
        endpoint = f"{url.rstrip('/')}/admin/upload-wortprofil?index={i}&total={total}"
        try:
            resp = session.post(
                endpoint,
                data=part,
                headers={"Content-Type": "application/octet-stream", "x-admin-token": token},
                timeout=120,
                verify=False,
            )
            resp.raise_for_status()
            body = resp.json()
            pct = (i + 1) / total * 100
            print(f"  [{i+1}/{total}] {pct:.0f}%  done={body.get('done')}", flush=True)
        except Exception as e:
            print(f"  FEHLER bei Chunk {i}: {e}")
            sys.exit(1)

    print("Fertig!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url",        required=True)
    parser.add_argument("--token",      required=True)
    parser.add_argument("--start-from", type=int, default=0, help="Chunk-Index zum Fortsetzen")
    args = parser.parse_args()
    upload(args.url, args.token, args.start_from)
