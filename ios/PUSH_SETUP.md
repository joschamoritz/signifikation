# iOS Push Notifications – Xcode Setup

Diese Anleitung beschreibt alle manuellen Schritte, die nach dem automatisierten
Setup (`npm install`, `cap sync`) noch in Xcode und im Apple Developer Portal
erledigt werden müssen.

## Voraussetzungen

- `@capacitor/push-notifications` ist installiert (package.json).
- `npx cap sync ios` wurde ausgeführt (Plugin ist in Package.swift eingetragen).
- Apple Developer Account mit aktiver Membership (kostenpflichtig, 99 USD/Jahr).

---

## 1. Xcode öffnen

```
ios/App/App.xcworkspace
```

Immer die `.xcworkspace`-Datei öffnen, nicht `.xcodeproj`.

---

## 2. Push Notifications Capability hinzufügen

1. Im Xcode-Navigator links das Projekt `App` anklicken.
2. Target **App** auswählen (nicht App-Tests).
3. Tab **Signing & Capabilities** öffnen.
4. Oben links **+ Capability** klicken.
5. In der Suche **Push Notifications** eingeben und doppelklicken.

Die Capability erscheint danach als Block in Signing & Capabilities.
Xcode legt automatisch eine `.entitlements`-Datei an falls noch keine vorhanden ist.

---

## 3. APNs Auth Key im Apple Developer Portal erstellen

URL: https://developer.apple.com/account/resources/authkeys/list

1. **Keys** → **+** klicken.
2. Key Name: z. B. `Signifikation APNs Key`.
3. **Apple Push Notifications service (APNs)** ankreuzen.
4. **Continue** → **Register**.
5. Seite **einmalig** anzeigen lassen und `.p8`-Datei herunterladen.
   (Diese Datei kann nicht erneut heruntergeladen werden – sicher aufbewahren!)

---

## 4. Werte notieren

Diese drei Werte werden als Umgebungsvariablen im Backend auf dem Hetzner-Server
gesetzt (`/opt/signifikation/app/.env`):

| Env-Variable   | Wo zu finden                                                        |
|----------------|---------------------------------------------------------------------|
| `APNS_KEY_ID`  | Apple Developer Portal → Keys → Key-Detailseite (10-stellige ID)   |
| `APNS_TEAM_ID` | Apple Developer Portal → Membership → Team ID (10-stellige ID)     |
| `APNS_KEY_PATH`| Absoluter Pfad zur `.p8`-Datei auf dem Server, z. B. `/opt/signifikation/keys/AuthKey_XXXXXXXXXX.p8` |

Bundle ID lautet: `de.signifikation.app`

Beispiel für `.env`-Einträge:

```
APNS_KEY_ID=ABCDE12345
APNS_TEAM_ID=FGHIJ67890
APNS_KEY_PATH=/opt/signifikation/keys/AuthKey_ABCDE12345.p8
```

---

## 5. `.p8`-Datei auf den Server übertragen

```bash
scp AuthKey_ABCDE12345.p8 root@signifikation.de:/opt/signifikation/keys/
```

Dateiberechtigungen einschränken:

```bash
chmod 600 /opt/signifikation/keys/AuthKey_ABCDE12345.p8
```

---

## 6. `npx cap sync ios` erneut ausführen

Nach jeder Capability-Änderung oder Plugin-Aktualisierung:

```bash
npx cap sync ios
```

---

## 7. Gerät testen

Push Notifications funktionieren **nicht** im Simulator – nur auf einem echten
iOS-Gerät. Testschritte:

1. Gerät per USB verbinden.
2. In Xcode oben das verbundene Gerät als Build-Ziel auswählen.
3. **Run** (Cmd+R).
4. In der App auf „Benachrichtigungen aktivieren" tippen.
5. iOS-Berechtigungsdialog bestätigen.
6. Xcode-Konsole zeigt den APNS-Token (für Server-seitige Tests).

---

## Troubleshooting

| Problem | Lösung |
|---------|--------|
| `registrationError` im Hook | Capability in Xcode fehlt oder Signing-Problem |
| Token kommt an, aber keine Notification | `.p8`-Datei oder Key ID/Team ID falsch im Backend |
| Simulator zeigt keinen Dialog | Erwartetes Verhalten – nur echtes Gerät |
| `entitlements`-Warnung beim Build | Signing & Capabilities → Team korrekt auswählen |
