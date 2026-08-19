# Phase F2 - Auto-Restart-Wrapper fuer annotate_lemmata.py
#
# Startet annotate_lemmata.py und setzt bei jedem Absturz/Abbruch automatisch
# fort -> der Lauf laeuft ohne taegliches Eingreifen durch. Resume ist in
# annotate_lemmata.py selbst eingebaut (Checkpoint-Tabelle lemmata_progress,
# im selben Commit wie die Daten) - dieser Wrapper ruft das Skript einfach
# erneut auf, KEIN --reset. Nur ein Windows-Neustart (Update) beendet auch
# diesen Wrapper; Auto-Update-Neustarts vorher pausieren.
#
# Schutz gegen Endlos-Loop: Bricht ab, wenn 3 Versuche HINTEREINANDER in
# weniger als 120 s fehlschlagen (= persistenter Fehler statt normalem
# Absturz nach Stunden Laufzeit).
#
# WICHTIG: Diese Datei bewusst reines ASCII (keine Umlaute/Sonderzeichen).
# Windows PowerShell 5.1 liest .ps1 ohne BOM als ANSI - UTF-8-Sonderzeichen
# zerschiessen dann das String-Parsing (in Phase D real passiert).
#
# Aufruf (PowerShell):
#   .\06_belege\annotate_lemmata_run.ps1

param(
    [string]$Db          = "C:\wortprofil_v2\belege_v2.db",
    [string]$WortprofilDb = "C:\wortprofil_v2\wortprofil_v2.db",
    [int]$Workers        = 8,
    [int]$MaxTries       = 500
)

$ErrorActionPreference = "Continue"
Set-Location "D:\Schule\Kollokade\wortprofil"
$py  = ".\wortprofil-env\Scripts\python.exe"
$log = "06_belege\logs\annotate_lemmata.log"
New-Item -ItemType Directory -Force -Path "06_belege\logs" | Out-Null

Write-Host "Phase F2 Wrapper gestartet."
Write-Host "  DB          : $Db"
Write-Host "  WortprofilDb: $WortprofilDb"
Write-Host "  Workers     : $Workers"
Write-Host "  Log         : $log"

$schnelleFehler = 0
for ($i = 1; $i -le $MaxTries; $i++) {
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "======== Versuch $i / $MaxTries - $stamp ========"
    $t0 = Get-Date

    & $py -u "06_belege\annotate_lemmata.py" --db $Db --wortprofil-db $WortprofilDb --workers $Workers 2>&1 | Tee-Object -FilePath $log -Append

    $rc = $LASTEXITCODE
    $dauer = ((Get-Date) - $t0).TotalSeconds

    if ($rc -eq 0) {
        Write-Host "======== FERTIG nach $i Versuch(en), exit=0 ========"
        break
    }

    if ($dauer -lt 120) { $schnelleFehler++ } else { $schnelleFehler = 0 }
    if ($schnelleFehler -ge 3) {
        Write-Host "======== ABBRUCH: 3 sofortige Fehlschlaege in Folge unter 120 s."
        Write-Host "         Kein normaler Absturz, sondern ein echtes Problem."
        Write-Host "         Log pruefen: $log ========"
        break
    }

    $sek = [int]$dauer
    Write-Host "======== Fehler/Absturz exit=$rc nach $sek s - Resume in 60 s ========"
    Start-Sleep -Seconds 60
}
