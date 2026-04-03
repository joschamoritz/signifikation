#!/usr/bin/env python3
"""
Optimierter Upload fuer wortprofil.db mit kleineren Chunks
- 512 KB Chunks (statt 2 MB)
- Verbessertes Error-Handling
- Keep-Alive Verbindungen
"""
import math
import sys
import os
import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from urllib3.poolmanager import PoolManager
from pathlib import Path
import ssl

# Custom SSL-Kontext ohne Verification
class SSLAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        kwargs['ssl_context'] = ctx
        return super().init_poolmanager(*args, **kwargs)

DB_PATH = Path('D:/Schule/Kollokade/wortprofil/05_db/wortprofil.db')
CHUNK_KB = 512  # Kleinere Chunks fuer SSL-Stabilitaet
ADMIN_KEY = os.environ.get('ADMIN_KEY')
URL = "https://signifikation.de"

if not ADMIN_KEY:
    print("[FEHLER] ADMIN_KEY Umgebungsvariable nicht gesetzt")
    sys.exit(1)

if not DB_PATH.exists():
    print(f"[FEHLER] Datei nicht gefunden: {DB_PATH}")
    sys.exit(1)

# Session mit Custom SSL Adapter
session = requests.Session()
session.mount('https://', SSLAdapter())

# Retry Strategy
retry = Retry(
    total=15,
    backoff_factor=2,
    status_forcelist=[500, 502, 503, 504],
    allowed_methods=['POST']
)
adapter = HTTPAdapter(max_retries=retry)
session.mount('https://', SSLAdapter())

db_bytes = DB_PATH.read_bytes()
size = len(db_bytes)
chunk = CHUNK_KB * 1024
total = math.ceil(size / chunk)

print(f"Datei: {DB_PATH.name} ({size / 1e9:.2f} GB)")
print(f"Chunks: {total} x {CHUNK_KB} KB (~{size / total / 1024:.0f} KB pro Chunk)")
print(f"URL: {URL}/admin/upload-wortprofil")
print("=" * 60)

failed_chunks = []
start_time = time.time()

for i in range(total):
    part = db_bytes[i * chunk : (i + 1) * chunk]
    endpoint = f"{URL}/admin/upload-wortprofil?index={i}&total={total}"

    try:
        # Mit verbessertem Timeout und Retry
        resp = session.post(
            endpoint,
            data=part,
            headers={
                "Content-Type": "application/octet-stream",
                "x-admin-token": ADMIN_KEY,
                "Connection": "keep-alive"
            },
            timeout=(30, 180),  # (connect_timeout, read_timeout)
            verify=False,
        )

        if resp.status_code != 200:
            print(f"[{i+1:4d}/{total}] FEHLER: HTTP {resp.status_code}")
            print(f"  Response: {resp.text[:200]}")
            failed_chunks.append(i)
            continue

        body = resp.json()
        pct = (i + 1) / total * 100
        elapsed = time.time() - start_time
        speed = (i + 1) * CHUNK_KB / (elapsed / 60) if elapsed > 0 else 0

        print(f"[{i+1:4d}/{total}] {pct:5.1f}%  done={body.get('done'):5}  speed={speed:6.0f} KB/min")

        if body.get('done'):
            print("\n[SUCCESS] Upload abgeschlossen!")
            break

    except requests.exceptions.Timeout as e:
        print(f"[{i+1:4d}/{total}] TIMEOUT: {str(e)[:60]}")
        failed_chunks.append(i)
    except requests.exceptions.ConnectionError as e:
        print(f"[{i+1:4d}/{total}] CONNECTION ERROR: {str(e)[:60]}")
        failed_chunks.append(i)
    except Exception as e:
        print(f"[{i+1:4d}/{total}] FEHLER: {type(e).__name__}: {str(e)[:60]}")
        failed_chunks.append(i)

elapsed = time.time() - start_time
print(f"\n{'=' * 60}")
print(f"Zeit: {elapsed / 60:.1f} Minuten")

if failed_chunks:
    print(f"[FEHLER] {len(failed_chunks)} Chunks fehlgeschlagen: {failed_chunks[:10]}")
    print(f"Versuchen Sie mit: python upload_optimized.py --start-from {failed_chunks[0]}")
    sys.exit(1)
else:
    print("[OK] Alle Chunks erfolgreich hochgeladen!")
