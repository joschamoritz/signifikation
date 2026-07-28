# Phase D - Auto-Restart-Wrapper fuer den Voll-Parse
#
# Startet parallel_parse.py und setzt bei jedem Absturz automatisch mit --resume
# fort -> der Lauf laeuft ohne taegliches Eingreifen durch. Nur ein Windows-Neustart
# (Update) beendet auch diesen Wrapper; deshalb Updates vorher aussetzen
# (siehe PHASE_D_START.md, Checkliste). Optional den Wrapper in den Autostart
# legen, dann ueberlebt er auch einen Neustart.
#
# Schutz gegen Endlos-Loop: Bricht ab, wenn 3 Versuche HINTEREINANDER in < 120 s
# fehlschlagen (= persistenter Fehler statt normalem Absturz nach Stunden Laufzeit).
#
# WICHTIG: Diese Datei bewusst reines ASCII (keine Umlaute/Sonderzeichen).
# Windows PowerShell 5.1 liest .ps1 ohne BOM als ANSI - UTF-8-Sonderzeichen
# zerschiessen dann das String-Parsing (in Phase D real passiert).
#
# Aufruf (PowerShell):
#   .\phase_c\phase_d_run.ps1 -SsdDb "C:\wortprofil_v2\triples_v2.db"

param(
    [string]$SsdDb    = "C:\wortprofil_v2\triples_v2.db",
    [string]$WorkDir  = "D:\Schule\Kollokade\wortprofil\_work_triples_v2",
    # Teil-DBs auf die SSD: sie bekommen bei jedem Checkpoint Random-I/O in
    # wachsende Indizes. Auf der HDD saettigte das die Platte (Disk-Time 125 %)
    # und halbierte den Durchsatz, waehrend die CPU zu 80 % idle war.
    [string]$PartsDir = "C:\wortprofil_v2\parts",
    [int]$Pool        = 4,
    [int]$Shards      = 6,
    [int]$MaxTries    = 200
)

$ErrorActionPreference = "Continue"
Set-Location "D:\Schule\Kollokade\wortprofil"
$py  = ".\wortprofil-env\Scripts\python.exe"
$log = "phase_c\logs\phase_d.log"
New-Item -ItemType Directory -Force -Path "phase_c\logs" | Out-Null

Write-Host "Phase D Wrapper gestartet."
Write-Host "  Ziel-DB : $SsdDb"
Write-Host "  WorkDir : $WorkDir"
Write-Host "  PartsDir: $PartsDir"
Write-Host "  Pool    : $Pool   Shards: $Shards"
Write-Host "  Log     : $log"

$schnelleFehler = 0
for ($i = 1; $i -le $MaxTries; $i++) {
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Write-Host "======== Versuch $i / $MaxTries - $stamp ========"
    $t0 = Get-Date

    & $py -u "phase_c\parallel_parse.py" --input-dir "02_parsed_v2" --out-db $SsdDb --workdir $WorkDir --parts-dir $PartsDir --pool $Pool --shards $Shards --resume 2>&1 | Tee-Object -FilePath $log -Append

    $rc = $LASTEXITCODE
    $dauer = ((Get-Date) - $t0).TotalSeconds

    if ($rc -eq 0) {
        Write-Host "======== FERTIG nach $i Versuch(en), exit=0 ========"
        break
    }

    # Persistenter-Fehler-Schutz: mehrere sofortige Fehlschlaege => abbrechen
    if ($dauer -lt 120) { $schnelleFehler++ } else { $schnelleFehler = 0 }
    if ($schnelleFehler -ge 3) {
        Write-Host "======== ABBRUCH: 3 sofortige Fehlschlaege in Folge unter 120 s."
        Write-Host "         Kein normaler Absturz, sondern ein echtes Problem."
        Write-Host "         Log pruefen: $log und $WorkDir\logs\ ========"
        break
    }

    $sek = [int]$dauer
    Write-Host "======== Fehler/Absturz exit=$rc nach $sek s - Resume in 60 s ========"
    Start-Sleep -Seconds 60
}
