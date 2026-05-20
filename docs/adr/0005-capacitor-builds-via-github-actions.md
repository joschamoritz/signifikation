# ADR-0005: Capacitor-iOS-Builds nur via GitHub Actions

**Status:** Accepted
**Datum:** 2026-03

## Kontext

Die App soll auf iOS verfügbar sein. Capacitor 8 wickelt React-App in
WKWebView. Builds, Code-Signing und TestFlight-Upload erfordern Xcode +
Apple-Developer-Account. Lokale Entwicklungsumgebung ist Windows — kein
Mac vorhanden.

## Entscheidung

Alle iOS-Builds laufen ausschließlich über GitHub Actions
(`.github/workflows/ios-testflight.yml`, manuell via `workflow_dispatch`):

1. `npm run build` → React in `dist/`
2. `npx cap sync ios` → assets in `ios/App/App/public/`
3. `agvtool` setzt Build-Nummer aus `github.run_number`
4. `xcodebuild archive` + Code-Sign mit Apple-Distribution-Cert
5. Upload zu TestFlight via `xcrun altool`

Web-Assets werden gebündelt ausgeliefert (`webDir: dist`, **kein**
`server.url`). Änderungen an `ios/App/App/*` (Privacy-Manifest, Icons,
nativen Plugins) gehen direkt ins Git-Projekt und werden im Workflow
gepoddet.

## Konsequenzen

**Positiv:**
- Keine Mac-Investition nötig (~3000 € gespart)
- Reproduzierbare Builds — keine "works on my Mac"-Probleme
- Build-Logs persistent in GHA-History
- Cert-Management nur in GHA-Secrets, kein lokales Keychain-Risiko

**Negativ:**
- Iteration langsam: jeder Native-Plugin-Test braucht GHA-Roundtrip (~10
  min pro Build)
- Native-Debug ohne lokales Xcode kaum möglich — Crash-Logs nur via
  TestFlight oder Apple-Crash-Reports
- Kein lokaler iOS-Simulator → Layout-Probleme erst auf echtem Gerät
  sichtbar
- Sentry oder andere Native-SDKs müssen blind via Workflow gepoddet
  werden (Riskanter Pfad)

## Implikationen für andere ADRs

- **ADR-0002 (better-auth):** Bearer-Token-Pfad statt Cookie-only, weil
  WKWebView-Cookies in `Capacitor.isNativePlatform()`-Modus zickig sind
- **Push:** APN-Konfiguration via `ios-testflight.yml`, JWS-Verifikation
  serverseitig (siehe `server/routes/iap.js`)
- **Code-Audit H8:** Capacitor-Secure-Storage-Migration ist riskant ohne
  lokalen Native-Build-Test → bleibt offen

## Verworfene Alternativen

- **Mac mini kaufen:** Investition + Maintenance + Single-Point-of-Failure
- **MacInCloud / MacStadium:** läuft, aber Monatskosten + Latenz; GHA hat
  freie macOS-Runner-Minuten im akzeptablen Rahmen
- **Capacitor mit `server.url` auf signifikation.de:** würde Push-
  Notifications + Offline-Modus + StoreKit-Pfad brechen
