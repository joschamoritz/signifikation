@echo off
REM Wortprofil Pipeline – Setup-Skript (Windows)
REM Voraussetzung: Python 3.12 installiert und im PATH als "py -3.12"

echo === Schritt 1: Virtualenv erstellen ===
py -3.12 -m venv D:\Schule\Kollokade\wortprofil\wortprofil-env
if errorlevel 1 (echo FEHLER: Virtualenv konnte nicht erstellt werden. & pause & exit /b 1)
echo OK

echo === Schritt 2: Virtualenv aktivieren ===
call D:\Schule\Kollokade\wortprofil\wortprofil-env\Scripts\activate.bat

echo === Schritt 3: pip aktualisieren ===
python -m pip install --upgrade pip
if errorlevel 1 (echo FEHLER: pip-Update fehlgeschlagen. & pause & exit /b 1)

echo === Schritt 4: PyTorch mit CUDA 12.6 ===
pip install torch --index-url https://download.pytorch.org/whl/cu126
if errorlevel 1 (echo FEHLER: PyTorch-Installation fehlgeschlagen. & pause & exit /b 1)
echo OK

echo === Schritt 5: spaCy + dwdsmor + Tools ===
pip install -r D:\Schule\Kollokade\wortprofil\00_setup\requirements.txt
if errorlevel 1 (echo FEHLER: requirements.txt-Installation fehlgeschlagen. & pause & exit /b 1)
echo OK

echo === Schritt 6: de_zdl_lg (ZDL spaCy-Modell) ===
pip install de-zdl-lg --index-url https://gitup.uni-potsdam.de/api/v4/projects/21461/packages/pypi/simple
if errorlevel 1 (echo FEHLER: de_zdl_lg-Installation fehlgeschlagen. & pause & exit /b 1)
echo OK

echo === Schritt 7: DWDS wordprofile-Toolkit ===
pip install git+https://github.com/zentrum-lexikographie/wordprofile.git
if errorlevel 1 (echo FEHLER: wordprofile-Installation fehlgeschlagen. & pause & exit /b 1)
echo OK

echo === Schritt 8: Installation testen ===
python D:\Schule\Kollokade\wortprofil\00_setup\test_setup.py

echo.
echo === Setup abgeschlossen ===
echo Virtualenv aktivieren mit:
echo   D:\Schule\Kollokade\wortprofil\wortprofil-env\Scripts\activate
pause
