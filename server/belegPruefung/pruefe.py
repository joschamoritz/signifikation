"""Syntaktische Belegprüfung: Steht der Kollokator im Satz wirklich in Relation zur Basis?

Aufgerufen von server/belegPruefung/index.js, ein Prozess je Prüflauf:
  stdin  {"paare": [{"schluessel": str, "basis": str, "kollokator": str,
                     "saetze": [[satz_id, satz], ...]}, ...]}
  stdout {"paare": [{"schluessel": str, "bestanden": [satz_id, ...],
                     "details": {"<satz_id>": {"rel": ["ATTR"], "start": int, "ende": int}}},
                    ...],
          "saetze": int, "sekunden": float}

`details` sagt je bestandenem Satz, in welcher Relation Basis und Kollokator stehen (aus
Sicht der Basis wie im Wortprofil: „ATTR“ bei „süßer Traum“ für Traum, „~ATTR“ für süß) und
wo der Kollokator steht (Zeichenposition, Codepoints). Der Lückenfüller braucht beides:
einen Satz mit genau seiner Relation und die exakte Stelle für die Lücke.

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


def konjunkt_boegen(doc):
    """Bögen (Kopf-Token, Relation, Dependent-Token), die extrahiere_triples() über
    Koordination verpasst."""
    boegen = []
    for tok in doc:
        if tok.dep_ != "conj":
            continue
        erstes = tok.head
        # Zweites Konjunkt erbt die Rolle des ersten: „Ämter und Mandate niedergelegt“
        rel = relation_von(erstes.dep_, erstes.head, tok, prep_quelle=erstes)
        if rel:
            boegen.append((erstes.head, rel, tok))
        # Verbkoordination teilt Subjekt und Objekt: „abgeholt und niedergelegt“
        if erstes.pos_ in pd.VERB_POS and tok.pos_ in pd.VERB_POS:
            for kind in erstes.children:
                rel = relation_von(kind.dep_, tok, kind) if kind.dep_ in ("nsubj", "nsubj:pass", "obj") else None
                if rel:
                    boegen.append((tok, rel, kind))
            for kind in tok.children:
                rel = relation_von(kind.dep_, erstes, kind) if kind.dep_ == "obj" else None
                if rel:
                    boegen.append((erstes, rel, kind))
    return boegen


def boegen(doc):
    """Alle Bögen eines Satzes als (Kopf-Token, Relation, Dependent-Token).

    Was ein Bogen ist, entscheidet extrahiere_triples() (Lemma-Tripel); hier werden die
    Tripel nur den Token-Paaren zugeordnet, aus denen sie entstanden sind – jedes Tripel
    stammt aus einem Token und seinem direkten Kopf. KON gibt extrahiere_triples() in
    beiden Richtungen aus, daher wird auch die Gegenrichtung gesucht."""
    lemma = {t.i: pd.lemma_of(t) for t in doc}
    rels = {}
    for hl, _hp, rel, dl, *_ in pd.extrahiere_triples(doc):
        rels.setdefault((hl, dl), set()).add(rel)
    ergebnis = []
    for t in doc:
        h = t.head
        if h is t:
            continue
        for rel in rels.get((lemma[h.i], lemma[t.i]), ()):
            ergebnis.append((h, rel, t))
        if "KON" in rels.get((lemma[t.i], lemma[h.i]), ()):
            ergebnis.append((t, "KON", h))
    return ergebnis + konjunkt_boegen(doc)


def treffer_im_satz(satz_boegen, basis, kollokator):
    """Bögen zwischen Basis und Kollokator: Relationen aus Sicht der Basis („ATTR“, wenn die
    Basis Kopf ist, „~ATTR“, wenn sie Dependent ist – wie im Wortprofil) und das
    Kollokator-Token. None, wenn kein Bogen beide verbindet."""
    relationen = []
    token = None
    for kopf, rel, dep in satz_boegen:
        hl, dl = pd.lemma_of(kopf), pd.lemma_of(dep)
        if hl == basis and dl == kollokator:
            relationen.append(rel)
            token = token or dep
        elif hl == kollokator and dl == basis:
            relationen.append(rel if rel == "KON" else f"~{rel}")
            token = token or kopf
    if token is None:
        return None
    # Zeichenposition im Satz (Codepoints, wie Python zählt)
    return {"rel": sorted(set(relationen)), "start": token.idx, "ende": token.idx + len(token.text)}


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
        basis, kollokator = p["basis"].lower(), p["kollokator"].lower()
        details = {}
        for sid, satz in p["saetze"]:
            treffer = treffer_im_satz(boegen_je_satz[satz], basis, kollokator)
            if treffer:
                details[str(sid)] = treffer
        ausgabe.append({
            "schluessel": p["schluessel"],
            "bestanden": [sid for sid, _ in p["saetze"] if str(sid) in details],
            "details": details,
        })

    sys.stdout.buffer.write(json.dumps(
        {"paare": ausgabe, "saetze": len(texte), "sekunden": round(sekunden, 1)},
        ensure_ascii=False,
    ).encode("utf-8"))


if __name__ == "__main__":
    main()
