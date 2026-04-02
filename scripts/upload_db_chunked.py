#!/usr/bin/env python3
"""
Chunked DB Upload zu Railway
Teilt die SQLite-DB in 50-MB-Stücke und lädt sie sequenziell hoch.
Umgeht den Railway-Proxy-Timeout (60s).

Aufruf:
    python upload_db_chunked.py --file wortprofil/05_db/wortprofil.db --name wortprofil
"""

import argparse
import io
import json
import math
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

BASE_URL   = "https://signifikation.de"
ADMIN_KEY  = "waz6@8mliSIG"
CHUNK_SIZE = 50 * 1024 * 1024   # 50 MB pro Chunk


def get_token() -> str:
    payload = json.dumps({"key": ADMIN_KEY}).encode()
    req = urllib.request.Request(
        f"{BASE_URL}/admin/auth",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    return data["token"]


def upload_chunk(token: str, name: str, chunk: bytes, index: int, total: int, retries: int = 3) -> dict:
    url = f"{BASE_URL}/admin/upload-db-chunk?name={name}&index={index}&total={total}"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url,
                data=chunk,
                headers={
                    "Content-Type": "application/octet-stream",
                    "x-admin-token": token,
                    "Content-Length": str(len(chunk)),
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read())
        except Exception as e:
            if attempt < retries - 1:
                print(f"    ⚠️  Fehler (Versuch {attempt+1}/{retries}): {e} — retry in 3s ...")
                time.sleep(3)
            else:
                raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True, help="Pfad zur SQLite-DB")
    parser.add_argument("--name", required=True, choices=["wortprofil", "belege"])
    parser.add_argument("--start", type=int, default=0, help="Chunk-Index zum Fortsetzen")
    args = parser.parse_args()

    db_path = Path(args.file)
    if not db_path.exists():
        print(f"Fehler: Datei nicht gefunden: {db_path}")
        sys.exit(1)

    file_size  = db_path.stat().st_size
    total_chunks = math.ceil(file_size / CHUNK_SIZE)

    print(f"Datei:   {db_path} ({file_size / 1024**3:.2f} GB)")
    print(f"Chunks:  {total_chunks} × {CHUNK_SIZE // 1024**2} MB")
    print(f"Ziel:    {BASE_URL}/admin/upload-db-chunk?name={args.name}")
    print()

    print("Hole Auth-Token ...")
    token = get_token()
    print(f"Token erhalten.\n")

    start_time = time.time()

    with open(db_path, "rb") as f:
        if args.start > 0:
            f.seek(args.start * CHUNK_SIZE)
            print(f"Fortsetzen ab Chunk {args.start}/{total_chunks}\n")

        for i in range(args.start, total_chunks):
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                break

            pct      = (i + 1) / total_chunks * 100
            elapsed  = time.time() - start_time
            speed    = ((i - args.start + 1) * CHUNK_SIZE / 1024**2) / max(elapsed, 1)
            remaining = (total_chunks - i - 1) * CHUNK_SIZE / 1024**2 / max(speed, 0.1)

            print(f"  Chunk {i+1:3d}/{total_chunks} ({pct:5.1f}%) | {speed:.1f} MB/s | ~{remaining/60:.1f} min übrig ...",
                  end="", flush=True)

            result = upload_chunk(token, args.name, chunk, i, total_chunks)

            if result.get("done"):
                print(f" FERTIG")
            else:
                print(f" OK")

    total_time = time.time() - start_time
    print(f"\nUpload abgeschlossen in {total_time/60:.1f} Minuten.")
    print(f"DB liegt jetzt auf Railway unter: {args.name}.db")


if __name__ == "__main__":
    main()
