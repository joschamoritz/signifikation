"""Syntaktische Belegprüfung: Steht der Kollokator im Satz wirklich in Relation zur Basis?

Aufgerufen von server/belegPruefung/index.js, ein Prozess je Prüflauf:
  stdin  {"paare": [{"schluessel": str, "basis": str, "kollokator": str,
                     "saetze": [[satz_id, satz], ...]}, ...]}
  stdout {"paare": [{"schluessel": str, "bestanden": [satz_id, ...]}, ...],
          "saetze": int, "sekunden": float}

Geprüft wird mit derselben Definition wie im Wortprofil: `extrahiere_triples()` aus
wortprofil/03_parse/parse_deps_v2.py. Ein Satz besteht, wenn eines seiner Tripel Basis
und Kollokator verbindet, gleich in welcher Richtung und Relation (das Spiel fragt die
Belege ohne Relation ab). Dazu kommen die Konjunkte, die `extrahiere_triples()`
auslässt: „Ämter und Mandate niedergelegt“ verbindet auch „Mandat“ mit „niederlegen“,
„abgeholt und niedergelegt“ gibt das Subjekt an beide Verben weiter. Ohne diese Regel
fielen in der Messung vom 29.10.2026 gerade solche korrekten Sätze durch.

Ohne dwdsmor (BELEGPRUEFUNG_DWDSMOR=1 schaltet es zu): In der Messung unterschieden
sich 3 von 1.915 Urteilen, der Server spart die Installation des Transducers.
"""
import contextlib
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "wortprofil" / "03_parse"))
import parse_deps_v2 as pd  # noqa: E402

PREP_RELATIONEN = ("obl", "obl:arg")


def relation_von(dep, kopf, tok, prep_quelle=None):
    """Relation, die `tok` als Dependent von `kopf` unter dem Label `dep` hätte –
    dieselben Bedingungen wie die elif-Kette in extrahiere_triples()."""
    k_pos, t_pos = kopf.pos_, tok.pos_
    if dep in ("nsubj", "nsubj:pass") and k_pos in pd.VERB_POS and t_pos in pd.SUBJ_DEP_POS:
        return "SUBJA"
    if dep == "obj" and k_pos in pd.VERB_POS and t_pos in pd.SUBJ_DEP_POS:
        return "OBJA"
    if dep == "iobj" and k_pos in pd.VERB_POS and t_pos in pd.NOUN_POS:
        return "OBJD"
    if dep == "amod" and k_pos in pd.NOUN_POS and t_pos == "ADJ":
        return "ATTR"
    if dep == "advmod" and k_pos in pd.VERB_POS and t_pos == "ADV":
        return "ADV"
    if dep == "xcomp" and k_pos in pd.VERB_POS and t_pos in pd.NOUN_POS | {"ADJ"}:
        return "PRED"
    if dep in PREP_RELATIONEN and k_pos in pd.VERB_POS and t_pos in pd.NOUN_POS:
        # „auf Tür und Tor“: die Präposition hängt nur am ersten Konjunkt
        for quelle in (tok, prep_quelle):
            if quelle is not None and any(c.dep_ == "case" and c.pos_ == "ADP" for c in quelle.children):
                return "PP"
    return None


def konjunkt_bogen(doc):
    """Lemma-Paare, die extrahiere_triples() über Koordination verpasst."""
    paare = set()
    for tok in doc:
        if tok.dep_ != "conj":
            continue
        erstes = tok.head
        # Zweites Konjunkt erbt die Rolle des ersten: „Ämter und Mandate niedergelegt“
        if relation_von(erstes.dep_, erstes.head, tok, prep_quelle=erstes):
            paare.add((pd.lemma_of(erstes.head), pd.lemma_of(tok)))
        # Verbkoordination teilt Subjekt und Objekt: „abgeholt und niedergelegt“
        if erstes.pos_ in pd.VERB_POS and tok.pos_ in pd.VERB_POS:
            for kind in erstes.children:
                if kind.dep_ in ("nsubj", "nsubj:pass", "obj") and relation_von(kind.dep_, tok, kind):
                    paare.add((pd.lemma_of(tok), pd.lemma_of(kind)))
            for kind in tok.children:
                if kind.dep_ == "obj" and relation_von(kind.dep_, erstes, kind):
                    paare.add((pd.lemma_of(erstes), pd.lemma_of(kind)))
    return paare


def boegen(doc):
    """Alle verbundenen Lemma-Paare eines Satzes, ungerichtet."""
    paare = {(t[0], t[3]) for t in pd.extrahiere_triples(doc)}
    paare |= konjunkt_bogen(doc)
    return {frozenset(p) for p in paare}


def main():
    eingabe = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    # lade_modell() schreibt Fortschritt nach stdout – das gehört zur Antwort
    with contextlib.redirect_stdout(sys.stderr):
        nlp = pd.lade_modell(use_dwdsmor=os.environ.get("BELEGPRUEFUNG_DWDSMOR") == "1")

    texte = list(dict.fromkeys(satz for p in eingabe["paare"] for _id, satz in p["saetze"]))
    t0 = time.perf_counter()
    boegen_je_satz = {text: boegen(doc) for text, doc in zip(texte, nlp.pipe(texte, batch_size=64))}
    sekunden = time.perf_counter() - t0

    ausgabe = []
    for p in eingabe["paare"]:
        ziel = frozenset((p["basis"].lower(), p["kollokator"].lower()))
        bestanden = [sid for sid, satz in p["saetze"] if ziel in boegen_je_satz[satz]]
        ausgabe.append({"schluessel": p["schluessel"], "bestanden": bestanden})

    sys.stdout.buffer.write(json.dumps(
        {"paare": ausgabe, "saetze": len(texte), "sekunden": round(sekunden, 1)},
        ensure_ascii=False,
    ).encode("utf-8"))


if __name__ == "__main__":
    main()
