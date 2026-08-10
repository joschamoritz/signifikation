// W4-S4 (7.2) — Entwurfs-Persistenz fuer Schueler-Antworten.
//
// Problem aus dem Realbedingungstest: Reload mitten im Spiel → die bereits
// getippte/ausgewaehlte Antwort war weg, obwohl die Session selbst (Token in
// sessionStorage) wiederhergestellt wurde. Der Spiel-State lag nur im lokalen
// useState der Mini-Spiel-Komponente.
//
// Loesung: den Antwort-Entwurf der AKTUELLEN Runde in sessionStorage spiegeln
// (Key pro Session/Assignment/Lemma/Runde). Beim Mount laden, bei jeder
// Aenderung schreiben, nach erfolgreicher Abgabe loeschen (Wrapper).
//
// Bewusst sessionStorage (nicht localStorage), konsistent mit D6 — der Entwurf
// stirbt mit dem Browser-Tab, kein dauerhaftes Personen-/Antwort-Tracking.

import { useEffect, useRef, useState } from 'react'

const PREFIX = 'classroom:draft:'

function storageOk() {
  return typeof sessionStorage !== 'undefined'
}

export function readDraft(key) {
  if (!key || !storageOk()) return null
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function writeDraft(key, value) {
  if (!key || !storageOk()) return
  try {
    if (value == null) sessionStorage.removeItem(PREFIX + key)
    else sessionStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {}
}

/** Loescht ALLE Entwuerfe, deren Key mit `base` beginnt (alle Runden/Zonen
 *  eines Lemmas). Nach erfolgreicher Abgabe aus dem Wrapper aufgerufen. */
export function clearDraftPrefix(base) {
  if (!base || !storageOk()) return
  const full = PREFIX + base
  try {
    const toRemove = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(full)) toRemove.push(k)
    }
    for (const k of toRemove) sessionStorage.removeItem(k)
  } catch {}
}

/**
 * useAnswerDraft(key, initial) — Drop-in-Ersatz fuer useState, der den Wert
 * in sessionStorage spiegelt. `key` darf null sein (dann reine In-Memory-
 * Variante ohne Persistenz). `initial` kann Wert oder Funktion sein.
 */
export function useAnswerDraft(key, initial) {
  const computeInitial = () => {
    const stored = readDraft(key)
    if (stored != null) return stored
    return typeof initial === 'function' ? initial() : initial
  }
  const [value, setValue] = useState(computeInitial)

  // Key-Wechsel (neues Lemma / neue Runde) → Entwurf neu laden.
  const lastKey = useRef(key)
  useEffect(() => {
    if (lastKey.current === key) return
    lastKey.current = key
    setValue(computeInitial())
    // initial bewusst nicht in den Deps — wir wollen nur auf Key-Wechsel reagieren.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Persistieren bei jeder Aenderung.
  useEffect(() => {
    if (!key) return
    writeDraft(key, value)
  }, [key, value])

  return [value, setValue]
}
