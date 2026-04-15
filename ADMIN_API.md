# Admin API – Signifikation

Alle Admin-Endpoints erfordern einen Session-Token im Header `x-admin-token`.

## Authentication

### POST /admin/auth
Tauscht Admin-Key gegen Session-Token.

**Request:**
```json
{ "key": "<ADMIN_KEY>" }
```

**Response:**
```json
{
  "token": "9d03a68e-d905-4fa9-...",
  "expiresAt": 1743760000000
}
```

**Rate Limit:** 60 req/min

---

### POST /admin/logout
Beendet die aktuelle Session.

**Headers:** `x-admin-token: <token>`

**Response:** `{ "ok": true }`

---

## Daily Word Management

### GET /admin/kalender
Alle Tageseinträge (Überblick mit Zeitreise- und Wort-Zwilling-Status).

**Response:**
```json
{
  "03-05": {
    "lemmata": [{ "id": "...", "lemma": "Wasser", "notiz": "..." }],
    "hasZeitreise": true,
    "hasWortZwilling": false
  }
}
```

---

### POST /admin/tag
Erstellt/überschreibt einen Tageseintrag.

**Request Body:**
```json
{
  "datum": "03-05",
  "woerter": ["Wasser", "Brot", "Tisch"],
  "notizen": ["...", "...", "..."],
  "links": ["https://...", "...", "..."],
  "definitionen": ["...", "...", "..."],
  "positionen": ["Substantiv", "Substantiv", "Substantiv"],
  "zeitreise_lemma": "Wasser",
  "zeitreise_wortart": "Substantiv",
  "zwilling_paar": ["Wasser", "Fluss"],
  "zwilling_pos": "Substantiv"
}
```

**Response:**
```json
{
  "ok": true,
  "datum": "03-05",
  "ids": ["id1", "id2", "id3"],
  "zeitreiseOk": true,
  "zwillingOk": false
}
```

---

### GET /admin/tag/:datum
Lädt einen Eintrag zum Bearbeiten.

**Example:** `GET /admin/tag/03-05`

**Response:** Vollständiger Tag-Eintrag

---

### DELETE /admin/tag/:datum
Löscht einen Eintrag.

---

## Analysis & Validation

### GET /admin/analyze-kollokation?q=Wort&pos=Substantiv
Analysiert ein Wort – prüft Tauglichkeit für Wort-des-Tages.

**Response:**
```json
{
  "lemma": "Wasser",
  "pos": "Substantiv",
  "runden": [
    {
      "relCode": "ATTR",
      "relName": "Attributiv",
      "items": [{ "wort": "kalt", "logDice": 8.5 }],
      "count": 42,
      "usable": true
    }
  ],
  "top3": [{ "wort": "kalt", "logDice": 8.5 }, ...],
  "bonus": { /* Bonusfrage */ },
  "usable": true
}
```

---

### GET /admin/analyze-zeitreise?q=Wort
Prüft ob Zeitreise-Daten verfügbar sind.

**Response:**
```json
{
  "usable": true,
  "lemma": "Wasser",
  "decades": 25,
  "paare": [{ "jahrzehnt": "1800-1809", "kollokat": "trinken", "score": 7.2 }],
  "perioden": ["1800-1809", "1810-1819", ...]
}
```

---

### GET /admin/analyze-wortzwilling?a=WortA&b=WortB&pos=Substantiv
Prüft ob zwei Wörter als Zwilling geeignet sind.

---

## Database Management

### POST /admin/upload-wortprofil?index=N&total=M
Lädt wortprofil.db in Chunks hoch (512 KB).

**Headers:**
- `Content-Type: application/octet-stream`
- `x-admin-token: <token>`

**Body:** Raw binary data (Chunk bytes)

**Response:**
```json
{ "ok": true, "done": false, "index": N }
// Letzter Chunk:
{ "ok": true, "done": true }
```

**Rate Limit:** 100 req/10s

---

## Statistics & Monitoring

### GET /admin/stats?days=30
Spielstatistiken der letzten N Tage.

**Response:**
```json
[
  {
    "datum": "03-04",
    "kollokationen": { "plays": 15, "scoreSum": 142, "maxSum": 150 },
    "zeitreise": { "plays": 8, "scoreSum": 76, "maxSum": 80 },
    "wortzwilling": { "plays": 12, "scoreSum": 108, "maxSum": 120 }
  }
]
```

---

### POST /admin/wiktionary-backfill
Holt IPA + Definitionen aus Wiktionary für alle bestehenden Lemmata nach (einmalig nach Migration ausführen).

**Response:**
```json
{ "ok": true, "updated": 42, "skipped": 8 }
```

---

## Backup & Export

### GET /admin/backup
Exportiert alle JSON-Daten als Single Download.

**Response:** JSON-Datei `signifikation-backup-YYYY-MM-DD.json`

Enthaelt zusaetzlich `files["stats-rows.json"]` mit rohen Stats-Zeilen
pro `(datum, spiel, user_id)` fuer verlustfreien Backup/Restore.

---

### POST /admin/backup/gist
Triggert manuelles GitHub Gist Backup.

**Response:**
```json
{
  "ok": true,
  "gistId": "abc123...",
  "url": "https://gist.github.com/...",
  "timestamp": "2026-04-03T10:30:00Z"
}
```

---

## Error Handling

All errors return HTTP status + JSON:

```json
{ "error": "Beschreibung des Fehlers" }
```

**Common Status Codes:**
- `400`: Ungültige Request (Validierungsfehler)
- `401`: Nicht autorisiert (fehlender/falscher Token)
- `403`: Forbidden (Path-Traversal-Versuch, Zukünftiges Datum)
- `405`: Method Not Allowed
- `429`: Rate Limit überschritten
- `500`: Server Error

---

## Rate Limits

- **Admin Routes:** 60 req/min (pro IP)
- **Upload:** 100 req/10s
- **Public API:** Unterschiedlich pro Endpoint

Token-Vergleich ist constant-time protected gegen Timing Attacks.
