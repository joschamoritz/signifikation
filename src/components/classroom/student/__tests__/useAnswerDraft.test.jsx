// @vitest-environment happy-dom
//
// W4-S4 (7.2) — Entwurfs-Persistenz: Reload mitten im Spiel darf die
// Auswahl nicht verlieren. Wir testen den Hook isoliert + die Prefix-Loeschung.

import { renderHook, act, cleanup } from '@testing-library/react'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import { useAnswerDraft, readDraft, clearDraftPrefix } from '../hooks/useAnswerDraft'

describe('useAnswerDraft (7.2)', () => {
  beforeEach(() => { sessionStorage.clear() })
  afterEach(() => { cleanup(); sessionStorage.clear() })

  it('spiegelt den Wert in sessionStorage und stellt ihn beim erneuten Mount wieder her', () => {
    const key = 's1:a1:l1::0'
    const first = renderHook(() => useAnswerDraft(key, []))
    act(() => { first.result.current[1](['stark', 'groß']) })
    expect(readDraft(key)).toEqual(['stark', 'groß'])

    // „Reload": neuer Mount mit gleichem Key → Wert ist wieder da.
    first.unmount()
    const second = renderHook(() => useAnswerDraft(key, []))
    expect(second.result.current[0]).toEqual(['stark', 'groß'])
  })

  it('ohne Key (null) wird nichts persistiert', () => {
    const { result } = renderHook(() => useAnswerDraft(null, []))
    act(() => { result.current[1](['x']) })
    expect(sessionStorage.length).toBe(0)
    expect(result.current[0]).toEqual(['x'])
  })

  it('clearDraftPrefix entfernt alle Runden-/Zonen-Keys eines Lemmas', () => {
    const base = 's1:a1:l1'
    renderHook(() => useAnswerDraft(`${base}::0:A`, ['a']))
    renderHook(() => useAnswerDraft(`${base}::0:B`, ['b']))
    renderHook(() => useAnswerDraft(`s1:a1:OTHER::0`, ['c']))
    act(() => {})
    expect(readDraft(`${base}::0:A`)).toEqual(['a'])
    clearDraftPrefix(base)
    expect(readDraft(`${base}::0:A`)).toBeNull()
    expect(readDraft(`${base}::0:B`)).toBeNull()
    // Anderes Lemma bleibt unberuehrt.
    expect(readDraft('s1:a1:OTHER::0')).toEqual(['c'])
  })
})
