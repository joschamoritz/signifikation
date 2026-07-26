# Phase D – Auto-Restart-Wrapper für den Voll-Parse
#
# Startet parallel_parse.py und setzt bei jedem Absturz automatisch mit --resume
# fort → der Lauf läuft ohne tägliches Eingreifen durch. Nur ein Windows-Neustart
# (Update) beendet auch diesen Wrapper; deshalb Updates vorher aussetzen
# (siehe PHASE_D_START.md, Checkliste). Optional den Wrapper in den Autostart
# legen, dann überlebt er auch einen Neustart.
#
# Schutz gegen Endlos-Loop: Bricht ab, wenn 3 Versuche HINTEREINANDER in < 120 s
# fehlschlagen (= persistenter Fehler statt normalem Absturz nach Stunden Laufzeit).
#
# Aufruf (PowerShell, aus beliebigem Pfad):
#   .\phase_c\phase_d_run.ps1 -SsdDb "C:\wortprofil_v2\triples_v2.db"
#
# SsdDb  = Ziel-triples_v2.db auf der SSD (~35 GB Platz)
# WorkDir= Arbeitsverzeichnis auf der HDD (~60 GB: shards + parts)

param(
    [string]$SsdDb   = "C:\wortprofil_v2\triples_v2.db",
    [string]$WorkDir = "D:\Schule\Kollokade\wortprofil\_work_triples_v2",
    [int]$Pool       = 4,
    [int]$Shards     = 6,
    [int]$MaxTries   = 200
)

$ErrorActionPreference = "Continue"
Set-Location "D:\Schule\Kollokade\wortprofil"
$py  = ".\wortprofil-env\Scripts\python.exe"
$log = "phase_c\logs\phase_d.log"
New-Item -ItemType Directory -Force -Path "phase_c\logs" | Out-Null

$schnelleFehler = 0
for ($i = 1; $i -le $MaxTries; $i++) {
    Write-Host "======== Versuch $i / $MaxTries – $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ========"
    $t0 = Get-Date
    & $py -u "phase_c\parallel_parse.py" `
        --input-dir "02_parsed_v2" `
        --out-db $SsdDb `
        --workdir $WorkDir `
        --pool $Pool --shards $Shards --resume *>&1 | Tee-Object -FilePath $log -Append
    $rc = $LASTEXITCODE
    $dauer = ((Get-Date) - $t0).TotalSeconds

    if ($rc -eq 0) {
        Write-Host "======== FERTIG (exit 0) nach $i Versuch(en) ========"
        break
    }

    # Persistenter-Fehler-Schutz: mehrere sofortige Fehlschläge => abbrechen
    if ($dauer -lt 120) { $schnelleFehler++ } else { $schnelleFehler = 0 }
    if ($schnelleFehler -ge 3) {
        Write-Host "======== ABBRUCH: 3 sofortige Fehlschläge in Folge (< 120 s)."
        Write-Host "         Kein normaler Absturz, sondern ein echtes Problem."
        Write-Host "         Log prüfen: $log  und  $WorkDir\logs\<shard>.log ========"
        break
    }

    Write-Host "======== Fehler/Absturz (exit $rc) nach $([int]$dauer) s – Resume in 60 s ========"
    Start-Sleep -Seconds 60
}
