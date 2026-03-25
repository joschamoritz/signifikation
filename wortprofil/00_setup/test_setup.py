"""
Testet ob alle Abhängigkeiten korrekt installiert sind.
Aufruf: python test_setup.py
"""

import sys

errors = []
warnings = []

print(f"Python: {sys.version}")
print()

# PyTorch + CUDA
try:
    import torch
    cuda_ok = torch.cuda.is_available()
    print(f"[{'OK' if cuda_ok else 'WARN'}] PyTorch {torch.__version__} – CUDA verfügbar: {cuda_ok}")
    if cuda_ok:
        print(f"       GPU: {torch.cuda.get_device_name(0)}")
        print(f"       CUDA: {torch.version.cuda}")
    else:
        warnings.append("PyTorch findet keine CUDA-GPU. Transformer-Modell wird sehr langsam sein.")
except ImportError:
    errors.append("PyTorch nicht installiert.")
    print("[FEHLER] PyTorch fehlt")

# spaCy
try:
    import spacy
    print(f"[OK]   spaCy {spacy.__version__}")
except ImportError:
    errors.append("spaCy nicht installiert.")
    print("[FEHLER] spaCy fehlt")

# de_zdl_lg Modell
try:
    import spacy
    nlp = spacy.load("de_zdl_lg")
    print(f"[OK]   de_zdl_lg geladen")
    # Kurztest
    doc = nlp("Die junge Frau liest ein Buch.")
    deps = [(t.text, t.dep_, t.head.text) for t in doc]
    print(f"       Testparse: {deps[:3]}...")
except Exception as e:
    errors.append(f"de_zdl_lg: {e}")
    print(f"[FEHLER] de_zdl_lg: {e}")

# dwdsmor
try:
    import dwdsmor
    lemmatizer = dwdsmor.lemmatizer()
    result = lemmatizer("gelesen", pos={"V"}).analysis
    print(f"[OK]   dwdsmor – Lemma von 'gelesen': {result}")
except Exception as e:
    warnings.append(f"dwdsmor: {e}")
    print(f"[WARN] dwdsmor: {e}")

# wordprofile
try:
    import wordprofile
    print(f"[OK]   wordprofile-Toolkit geladen")
except ImportError:
    errors.append("wordprofile nicht installiert.")
    print("[FEHLER] wordprofile fehlt")

# wikiextractor
try:
    import wikiextractor
    print(f"[OK]   wikiextractor geladen")
except ImportError:
    errors.append("wikiextractor nicht installiert.")
    print("[FEHLER] wikiextractor fehlt")

# Zusammenfassung
print()
print("=" * 50)
if errors:
    print(f"FEHLER ({len(errors)}):")
    for e in errors:
        print(f"  - {e}")
if warnings:
    print(f"WARNUNGEN ({len(warnings)}):")
    for w in warnings:
        print(f"  - {w}")
if not errors:
    print("Alle Pflicht-Pakete installiert. Setup erfolgreich.")
    if not warnings:
        print("Keine Warnungen. GPU-Beschleunigung aktiv.")
