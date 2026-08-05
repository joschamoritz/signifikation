# Phase G — Deployment-Runbook (Hetzner)

Stand 2026-08-04. Gehört zu `planning/DB-Neuaufbau.md` Phase G.
**Produktionssystem — jeden Schritt einzeln verifizieren, bei Überraschungen stoppen.**

Voraussetzung: Server-Code umgestellt und lokal grün (erledigt), Branch aber
**noch nicht gepusht** — der Deploy läuft über GitHub Actions auf `main`.

> **Reihenfolge — mit einer Bedingung, die 2026-08-05 einen 20-minütigen Ausfall
> gekostet hat.** Der neue Server-Code liest **beide** DB-Generationen
> (Schema-Erkennung über die Tabelle `saetze` bzw. `build_info.pipeline_version`).
> Nur deshalb ist die Reihenfolge von Code-Deploy und DB-Umschaltung unkritisch,
> und nur deshalb wirkt der Rollback „Env zurück + Restart".
>
> **Das gilt aber erst, wenn der Code auch wirklich deployt ist.** Beim ersten
> Versuch lief auf dem Server noch der alte `belege.js`, der `FROM belege`
> abfragt — eine Tabelle, die `belege_v2.db` nicht mehr hat. Ergebnis: jede
> Beleg-Abfrage warf, `/api/v1/belege` antwortete 502, Beleganzeige,
> Lückenfüller, Archiv-KWiC und Kurs-Station 5 waren tot. Die Spielmodi liefen
> weiter, weil `wortprofil.js` auch mit altem Code gegen v2 funktioniert.
>
> **Deshalb vor Schritt 8 zwingend:**
>
> ```bash
> git log origin/main -1 --format='%h %s'     # ist der Phase-G-Commit drauf?
> curl -s "https://signifikation.de/api/v1/belege?lemma=Tisch&collocate=rund" | head -c 80
> ```
>
> Die zweite Zeile muss **mit den alten DBs** Belege liefern. Erst wenn der neue
> Code nachweislich das alte Schema noch bedient, darf die `.env` umgestellt
> werden.
>
> ⚠️ **`/health` beantwortet diese Frage NICHT.** Es prüft über
> `belegeVerfuegbar()` nur, ob sich die Datei öffnen lässt — und meldete während
> des gesamten Ausfalls fröhlich `"belege":"ok"`. Immer eine echte Abfrage testen.

---

## 0. Was ich nicht selbst ausführen kann

Auf dem Server verlangt **jeder** Zugriff unter `/opt/signifikation` und `/mnt`
ein interaktives sudo-Passwort:

```
$ sudo -n -l
sudo: a password is required
$ ls -ld /opt/signifikation/app
ls: cannot access '/opt/signifikation/app': Permission denied
```

Betroffen sind Schritt 3, 7, 8 und der Rollback. Drei Wege:

1. Du führst diese Blöcke selbst aus und schickst mir die Ausgabe zurück (empfohlen —
   es sind wenige, klar abgegrenzte Kommandos).
2. Du sitzt am Terminal und tippst das Passwort, wenn ich es brauche.
3. Eine eng gefasste `sudoers`-Regel für die Dauer der Migration.

Alles ohne sudu — Mount-Prüfung (Schritt 2), Bandbreitenmessung (4), Upload ins
Staging-Verzeichnis (5), Prüfsummen (6) — mache ich selbst.

---

## 1. Volume anlegen (Cloud-Panel, dein Schritt)

1. <https://console.hetzner.cloud> öffnen, das Projekt mit dem Signifikation-Server wählen.
2. Linke Leiste → **Volumes** → **Create Volume**.
3. **Location: Nürnberg (nbg1)** — muss dieselbe sein wie der Server, sonst lässt
   sich das Volume nicht anhängen.
4. **Server:** den Signifikation-Server auswählen (hängt es direkt an).
5. **Size: 60 GB** (Begründung unten).
6. **Format and mount:** `ext4` wählen, **„Automatically mount Volume"** aktiviert lassen.
   Hetzner legt dann selbst einen `/etc/fstab`-Eintrag an und mountet unter
   `/mnt/HC_Volume_<ID>`.
7. **Name:** z. B. `signifikation-korpus`.
8. **Create & Buy now.**

### Warum 60 GB — und warum nicht die 50 GB aus dem Plan

Die 50 GB stammen aus einer Schätzung vor Phase D. Die realen Zahlen (dezimal,
so rechnet Hetzner ab):

| Posten | Größe |
|---|---:|
| `wortprofil_v2.db` | **18,41 GB** |
| `belege_v2.db` | **34,18 GB** |
| **Kern-Datenbestand** | **52,59 GB** = 48,98 GiB |

Auf 50 GB passt das nicht. Auf 60 GB passt es bequem — **nachgemessen am
angelegten Volume (2026-08-04)**, nicht mehr geschätzt:

| | Bytes | GiB |
|---|---:|---:|
| Blockdevice `/dev/sdb` | 64.424.509.440 | 60,00 |
| Dateisystem nach `mkfs.ext4` | 63.090.503.680 | 58,76 |
| verfügbar mit ext4-Standardreserve (5 %) | 59.852.476.416 | 55,74 |
| − Daten (52,59 GB) | 52.593.950.720 | 48,98 |
| **frei** | | **6,76 (12,1 %)** |
| dasselbe nach `tune2fs -m 1` | | **~9,1 (15,7 %)** |

> **Korrektur gegenüber der ersten Fassung dieses Runbooks:** Hetzner rechnet
> Volumes in **GiB**, nicht in Dezimal-GB — „60 GB" sind 60 × 1024³ Byte. Die
> erste Rechnung war dezimal angesetzt und kam auf nur 5,5 GiB frei; deshalb
> stand `tune2fs -m 1` dort als Pflicht. Es ist tatsächlich optional.

**10 % Luft sind hier vertretbar, weil nichts wächst:** die App öffnet beide DBs
`readonly` (kein WAL, keine Journaldateien), und `temp_store=MEMORY` verhindert
Temp-Dateien auf dem Volume. Der Upload braucht ebenfalls keinen Zusatzplatz —
Staging- und Zielverzeichnis liegen auf demselben Dateisystem, `mv` ist dort ein
Rename. Der Bestand ist also statisch.

**Was 60 GB nicht können — bewusst in Kauf genommen (Entscheidung 2026-08-04):**

- **Phase F2 (Lemma-FTS) ist zurückgestellt.** Sie hätte je nach Bauart **+15 GB**
  (nur contentless-Index) bis **+30 GB** (Textspalte + Index) gebraucht — die
  Plan-Annahme „+3–5 GB" ist deutlich zu niedrig, gemessen an der fertigen DB
  (141.731.248 Sätze × 132,5 Zeichen ≈ 18,8 GB reiner Satztext). F2 ist additiv
  entworfen und jederzeit nachholbar; vorher muss das Volume vergrößert werden.
- **Kein Austausch-Puffer.** `belege_v2.db` später zu ersetzen hieße erst löschen,
  dann 3–4 h hochladen — mit Ausfall der Beleg-Funktionen in dieser Zeit.

> **Vergrößern geht jederzeit und online:** Größe im Cloud-Panel erhöhen, dann auf
> dem Server `sudo resize2fs /dev/disk/by-id/scsi-0HC_Volume_<ID>` am gemounteten
> Dateisystem. Verkleinern geht nie. Für die 33 % Luft von 80 GB wären es
> +1,36 €/Monat — falls F2 doch früher kommt, ist das der Zeitpunkt.

| Größe | Preis/Monat | Trägt |
|---|---:|---|
| **60 GB** | **4,08 €** | **Ist-Stand, 10 % frei, statisch** ← gewählt |
| 80 GB | 5,44 € | + 33 % frei, Raum für ein schlankes F2 |
| 100 GB | 6,80 € | + F2 in jeder Bauart, 46 % frei |

Server + Volume damit **8,83 €/Monat** (4,75 + 4,08).

---

## 2. Mount prüfen (ohne sudo)

```bash
ssh admin@signifikation.de
lsblk
findmnt /mnt/HC_Volume_*
df -h /mnt/HC_Volume_*
cat /etc/fstab | grep HC_Volume
```

Erwartet: ein neues Device (~120 GB), gemountet unter `/mnt/HC_Volume_<ID>`,
Dateisystem `ext4`, ein `fstab`-Eintrag mit `nofail`.
**Die `<ID>` aus der Ausgabe brauche ich für alle folgenden Schritte.**

---

## 3. Verzeichnisse anlegen (sudo)

```bash
VOL=/mnt/HC_Volume_<ID>            # <ID> aus Schritt 2 einsetzen

# Zielverzeichnis: gehört dem Service-Account (Eigentums-Regel, Technik & Stack)
sudo mkdir -p "$VOL/signifikation"
sudo chown signifikation:signifikation "$VOL/signifikation"
sudo chmod 750 "$VOL/signifikation"

# Staging: hierhin lädt der Upload, admin darf schreiben
sudo mkdir -p "$VOL/staging"
sudo chown admin:admin "$VOL/staging"

# Optional, aber geschenkt: ext4 reserviert per Default 5 % für root. Auf einem
# reinen Datenvolume ist das ungenutzt — 2,35 GiB. Frei nach den Daten dann
# ~9,1 statt 6,76 GiB. Ohne diesen Schritt passt es auch.
sudo tune2fs -m 1 /dev/disk/by-id/scsi-0HC_Volume_<ID>
df -h "$VOL"     # „Avail" steigt von ~56G auf ~58G

# Kontrolle: jedes Verzeichnis der Kette muss für signifikation durchquerbar sein
sudo namei -l "$VOL/signifikation"
df -h "$VOL"
```

---

## 4. Bandbreite — bereits gemessen (2026-08-04)

```bash
time ( head -c 134217728 /dev/urandom \
  | ssh admin@signifikation.de "cat > /tmp/_probe && stat -c %s /tmp/_probe && rm -f /tmp/_probe" )
```

Ergebnis: **128 MiB in 79,5 s = 1,61 MiB/s ≈ 13,5 Mbit/s Upstream.**
Das ist der Flaschenhals, nicht die CPU und nicht der SSH-Overhead.

Kompressionsfaktor mit `gzip -1`, an je drei 64-MiB-Proben quer durch die Dateien:

| Datei | roh | Faktor | effektiv | ETA |
|---|---:|---:|---:|---:|
| `wortprofil_v2.db` | 18,41 GB | ~3,0× | ~6,1 GB | **~1,0 h** |
| `belege_v2.db` | 34,18 GB | ~2,2× | ~15,5 GB | **~2,5 h** |
| **zusammen** | **52,59 GB** | | **~21,6 GB** | **~3,5–4 h** |

Also ein Lauf über Nacht oder über einen Nachmittag. **Genau deshalb ist die
Wiederaufnahme in Schritt 5 kein Luxus** — eine einzige unterbrochene Pipe würde
Stunden kosten.

---

## 5. Upload — gestückelt, mit Fortschritt und Wiederaufnahme

Skript: `wortprofil/phase_g/upload_db.sh`. Es überträgt in 256-MiB-Blöcken,
komprimiert jeden Block einzeln (`gzip -1`) und schreibt ihn per `dd seek=` an die
richtige Stelle der Zieldatei. **Abbruch ist unkritisch:** beim erneuten Start
liest es die Größe der Zieldatei, rundet auf die letzte volle Blockgrenze ab und
macht dort weiter. Fortschritt, Durchsatz und Restzeit werden pro Block ausgegeben.

**Gegen den echten Server getestet** (2026-08-04): 20-MB-Datei mit inkompressiblen
Zufallsdaten, Übertragung nach 3 von 5 Blöcken abgebrochen, Skript neu gestartet →
setzte korrekt bei Block 3 auf, Endgröße exakt 20.000.000 Bytes, SHA-256 lokal und
remote identisch.

**Im Ernstfall bewährt und nachgeschärft** (2026-08-05): Der erste Voll-Upload
starb bei 43 % an einem Aussetzer der Heimleitung („Connection reset by peer").
Die Wiederaufnahme funktionierte — die 7,7 GB blieben liegen, der Neustart setzte
bei Block 30 auf. Zwei Lücken wurden danach geschlossen:

- **Retry je Block** (bis zu 6 Versuche, 15 s → 240 s Backoff) statt Abbruch des
  ganzen Laufs; `dd seek=` ist idempotent, ein erneut geschriebener Block ist
  unschädlich. Dazu `ServerAliveInterval=15`, damit eine tote Verbindung in ~60 s
  auffällt statt minutenlang zu hängen.
- **Auch die Hilfsaufrufe** (`stat` für den Wiederaufnahmepunkt, `truncate` am
  Ende) laufen über dieselbe Retry-Logik — dort hätte `set -e` sonst zugeschlagen.
- **Die beiden Dateien mit `&&` verketten, nicht mit `;`** — sonst startet der
  zweite Upload trotz gescheitertem ersten.

```bash
# Beispiel; VOL muss auf das Staging-Verzeichnis zeigen
export VOL=/mnt/HC_Volume_<ID>

bash wortprofil/phase_g/upload_db.sh /c/wortprofil_v2/wortprofil_v2.db "$VOL/staging/wortprofil_v2.db"
bash wortprofil/phase_g/upload_db.sh /c/wortprofil_v2/belege_v2.db     "$VOL/staging/belege_v2.db"
```

> **Abweichung vom Plan, bewusst:** Der Plan sieht eine einzige `zstd`-Pipe ohne
> Zwischendatei vor, um Doppelplatz auf dem Server zu sparen. Das Argument entfällt
> mit einem 120-GB-Volume, und die Pipe ist nicht wiederaufnehmbar — bei 34 GB über
> eine Heimleitung ist das ein reales Risiko. Zusätzlich ist `zstd` lokal gar nicht
> installiert (`gzip` schon). Wer die Plan-Variante will:
> `winget install Facebook.Zstandard`, dann
> `zstd -c belege_v2.db | ssh admin@… "zstd -d > $VOL/staging/belege_v2.db"`.

---

## 6. Integrität prüfen (ohne sudo, im Staging)

```bash
# a) Größen vergleichen
stat -c %s /c/wortprofil_v2/belege_v2.db
ssh admin@signifikation.de "stat -c %s $VOL/staging/belege_v2.db"

# b) Prüfsumme beidseitig — der eigentliche Beweis, dass nichts verloren ging
openssl dgst -sha256 /c/wortprofil_v2/belege_v2.db
ssh admin@signifikation.de "sha256sum $VOL/staging/belege_v2.db"

# c) SQLite-Selbstprüfung + Stichproben
ssh admin@signifikation.de "sqlite3 $VOL/staging/belege_v2.db \
  'PRAGMA quick_check;
   SELECT count(*) FROM saetze;
   SELECT count(*) FROM dokumente;
   SELECT count(*) FROM quellen;
   SELECT s.satz, d.ref FROM belege_fts
     JOIN saetze s ON s.id=belege_fts.rowid
     JOIN dokumente d ON d.doc_id=s.doc_id
    WHERE belege_fts MATCH ''\"tisch\" AND \"rund\"'' LIMIT 3;'"
```

Sollwerte: `saetze` = **141.731.248**, `dokumente` = **3.481.755**, `quellen` = **23**.
Für `wortprofil_v2.db`: `collocations` = **25.482.587**, `zeitreise` = **61.025.938**,
`lemma_corrections` = **13.790**.

> Zu `PRAGMA integrity_check` statt `quick_check`: der volle Lauf liest die ganze
> Datei und prüft zusätzlich alle Indizes — auf 34 GB dauert das lange. Die
> SHA-256-Übereinstimmung aus (b) ist für die Frage „ist die Datei heil angekommen"
> der stärkere Beweis; `integrity_check` lohnt nur, wenn (b) auffällig ist.

---

## 7. Ins Zielverzeichnis verschieben (sudo)

```bash
sudo mv "$VOL/staging/wortprofil_v2.db" "$VOL/signifikation/"
sudo mv "$VOL/staging/belege_v2.db"     "$VOL/signifikation/"
sudo chown signifikation:signifikation "$VOL/signifikation/"*.db
sudo chmod 640 "$VOL/signifikation/"*.db
sudo namei -l "$VOL/signifikation/belege_v2.db"
sudo -u signifikation test -r "$VOL/signifikation/belege_v2.db" && echo "signifikation kann lesen"
```

### 7b. Bestandsprüfung gegen die echte App-DB (vor dem Umschalten!)

Deckt die n-Deklinations-Verschiebung ab (`Frieden` → `Friede`). Das öffentliche
Archiv liefert nur vergangene Tage; hier zählt der volle Lemma-Bestand.

```bash
sudo -u signifikation sqlite3 -readonly \
  /opt/signifikation/app/server/data/signifikation.db \
  "SELECT DISTINCT lemma||'|'||pos FROM lemmata WHERE pos != '';" > /tmp/lemmata.txt
wc -l /tmp/lemmata.txt
```

Die Datei zu mir zurück, dann prüfe ich sie lokal gegen `wortprofil_v2`
(Abschnitt 11 von `app_smoke_g.mjs`). Erwartung nach der Archiv-Stichprobe:
0 Ausfälle — aber das ist die vollständige Prüfung.

---

## 8. Umschalten (sudo)

**Erst nachsehen, dann ändern.** In der produktiven `.env` standen die beiden
Variablen bereits aktiv (Zeilen 3 und 4, auf die alten Pfade). Blind anhängen
hätte zwei Zuweisungen derselben Variable hinterlassen — welche dotenv dann
gewinnen lässt, ist nichts, was man bei Produktions-Datenbankpfaden raten will.

```bash
sudo cp /opt/signifikation/app/.env /opt/signifikation/app/.env.bak-vor-v2
sudo chown signifikation:signifikation /opt/signifikation/app/.env.bak-vor-v2
sudo chmod 600 /opt/signifikation/app/.env.bak-vor-v2      # enthält Secrets!
sudo grep -nE '^[[:space:]]*#?[[:space:]]*(WORTPROFIL_DB|BELEGE_DB)' /opt/signifikation/app/.env
```

Vorhandene Zeilen **ersetzen** (nicht anhängen); `sed -i` erhält den Dateimodus:

```bash
sudo -u signifikation sed -i \
  -e "s#^WORTPROFIL_DB=.*#WORTPROFIL_DB=$VOL/signifikation/wortprofil_v2.db#" \
  -e "s#^BELEGE_DB=.*#BELEGE_DB=$VOL/signifikation/belege_v2.db#" \
  /opt/signifikation/app/.env
sudo grep -nE '^(WORTPROFIL_DB|BELEGE_DB)' /opt/signifikation/app/.env   # genau EINE Zeile je Variable
```

```bash
# Neustart – exakt nach Technik & Stack (nur so, nie als admin/deploy)
sudo -u signifikation env PATH=/opt/nvm/versions/node/v22.22.2/bin:$PATH \
  /opt/nvm/versions/node/v22.22.2/lib/node_modules/pm2/bin/pm2 \
  restart signifikation --update-env

# Kontrolle: die beiden Zeilen müssen im Log stehen
sudo tail -50 /opt/signifikation/.pm2/logs/signifikation-out-0.log | grep -E "Schema|Wortprofil-DB|Belege-DB|Varianten"
```

Erwartet:
```
Wortprofil-DB geladen: /mnt/HC_Volume_<ID>/signifikation/wortprofil_v2.db
Wortprofil-Schema: v2
Belege-DB geladen (Schema v2): /mnt/HC_Volume_<ID>/signifikation/belege_v2.db
Belege: 9747 Lemmata mit historischen Schreibvarianten geladen
```

---

## 8b. Nebenbefund: die produktive `.env` ist zu offen

Aufgefallen bei Schritt 8 (2026-08-05): `/opt/signifikation/app/.env` steht auf
`-rw-rw-r--` (664), Datum 22. Mai — also **für jeden Systemnutzer lesbar**, mit
`BETTER_AUTH_SECRET`, `MOLLIE_API_KEY`, `CLASSROOM_JOIN_SECRET` und den
APNs-Angaben darin. `Technik & Stack.md` schreibt `-rw-------` vor.

```bash
sudo chmod 600 /opt/signifikation/app/.env
sudo ls -l /opt/signifikation/app/.env
```

Kein Neustart nötig — die Datei wird nur beim Prozessstart gelesen. Hat nichts
mit der Migration zu tun, gehört aber in denselben Wartungsgang.

## 9. Produktion durchspielen

```bash
curl -s "https://signifikation.de/api/v1/belege?lemma=Tisch&collocate=rund" | head -c 600
curl -s "https://signifikation.de/wort/wasser" | grep -o 'CC BY[^<]*' | head -3
curl -s "https://signifikation.de/api/v1/heute" | head -c 300
```

Im Browser: alle vier Spielmodi, Beleganzeige, Lückenfüller, Archiv, Kurs-Station 5.

### Latenz: Basiswerte stehen, Vergleich ist Pflicht

```bash
bash wortprofil/phase_g/prod_latenz.sh          # vorher UND nachher laufen lassen
```

**Gemessen am 2026-08-05 gegen die Produktion mit der alten `belege.db`:**

| Abfrage | Median | Maximum |
|---|---:|---:|
| `Lüge+auftischen` (sehr selten) | 0,091 s | 0,094 s |
| `Freund+treu` | 0,092 s | 0,140 s |
| `Tisch+rund` | 0,136 s | 0,266 s |
| `Angst+haben` | 0,464 s | 0,534 s |
| `Recht+haben` | 0,694 s | 0,770 s |
| **`Zeit+haben`** (extrem häufig) | **0,848 s** | 0,902 s |

**Warum das mehr ist als ein Beobachtungspunkt:** Die Produktion liegt mit der
**alten, halb so großen** DB bereits bei 0,85 s — praktisch derselbe Wert, den
Gate F lokal auf SSD für die **neue** DB gemessen hat (822 ms). Der VPS hat
3,7 GB RAM (2,8 GB verfügbar) für 52,6 GB Datenbank; der Page-Cache hält also nur
einen Bruchteil der FTS-Struktur. Mit 2,79× mehr Sätzen ist eine Verschlechterung
bei den sehr häufigen Paaren zu erwarten.

**Wichtig beim Messen:** Die Belege-Route cacht Antworten im Prozess (Key =
lemma:collocate:year). Fünfmal dieselbe URL misst viermal den Cache — die erste
Fassung des Skripts lieferte deshalb für `Zeit+haben` dieselben 0,09 s wie für
ein seltenes Paar. Das Skript variiert jetzt `year`, um echte DB-Abfragen zu
erzwingen.

**Entwarnung mit eingebaut:** Genau dieser Cache entschärft den Live-Betrieb —
die Wortpaare eines Spieltags sind für alle Nutzer dieselben, nur der erste
Aufruf zahlt. Auffällig wäre also nicht ein hoher Einzelwert, sondern wenn er
den ersten Spieler eines Tages spürbar warten lässt.

**Hebel, falls es stört (in dieser Reihenfolge):**
1. `BELEGE_MMAP_MB` in der `.env` erhöhen (Default 2048) — nach oben, nicht unten.
2. Prefetch der Tagespaare beim Start, analog zum bestehenden
   Zeitenwende-Prefetch (`server/jobs/`) → der erste Spieler zahlt dann nichts.
3. Erst danach über Schema-Eingriffe nachdenken.

---

## 10. Rollback (Sekunden)

Alte DBs bleiben auf der Root-Disk liegen. Der deployte Code liest sie weiterhin.

```bash
sudo cp /opt/signifikation/app/.env.bak-vor-v2 /opt/signifikation/app/.env
sudo -u signifikation env PATH=/opt/nvm/versions/node/v22.22.2/bin:$PATH \
  /opt/nvm/versions/node/v22.22.2/lib/node_modules/pm2/bin/pm2 \
  restart signifikation --update-env
sudo tail -20 /opt/signifikation/.pm2/logs/signifikation-out-0.log | grep -E "Schema|DB geladen"
```

Erwartet dann: `Wortprofil-Schema: v1` und `Belege-DB geladen (Schema v1)`.

---

## 11. Nach ~1 Woche unauffälligem Betrieb (separater Termin)

```bash
# Erst prüfen, dass wirklich die v2-DBs in Benutzung sind
sudo grep -E 'WORTPROFIL_DB|BELEGE_DB' /opt/signifikation/app/.env
# dann erst löschen
sudo rm /opt/.../belege.db /opt/.../wortprofil.db     # exakte Pfade vorher bestätigen
df -h /
```

Erwartet: Root-Disk gewinnt ~19 GB. Danach `planning/Datenbanken.md` und die
Quellenseite der App aktualisieren (Phase H).
