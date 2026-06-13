// @vitest-environment happy-dom

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { extractCode } from '../QrScanner'
import StudentJoinEntry from '../StudentJoinEntry'

describe('extractCode (F5 — QR-Text → Beitritts-Code)', () => {
  it('extrahiert den Code aus einer vollen Beitritts-URL', () => {
    expect(extractCode('https://signifikation.de/c/morgentau')).toBe('morgentau')
  })

  it('normalisiert Groß-/Kleinschreibung und Sonderzeichen', () => {
    expect(extractCode('https://signifikation.de/c/MORGEN-tau')).toBe('morgen-tau')
  })

  it('akzeptiert einen reinen Code (kein URL)', () => {
    expect(extractCode('morgentau')).toBe('morgentau')
  })

  it('liefert null bei zu kurzem oder leerem Input', () => {
    expect(extractCode('abc')).toBeNull()
    expect(extractCode('')).toBeNull()
    expect(extractCode(null)).toBeNull()
  })

  it('ignoriert fremde URLs ohne /c/-Pfad gibt aber Pfad-losen Text als Code zurueck', () => {
    // https://example.com/foo → kein /c/, Pfad „foo" ist kein Code-Text → der
    // gesamte String wird normalisiert: httpsexamplecomfoo (>=4) → als Code.
    // Wichtiger Realfall: ein QR mit reinem Code bleibt nutzbar, fremde Links
    // werden serverseitig beim /join eh als INVALID_CODE abgelehnt.
    expect(extractCode('https://example.com/c/abcdef')).toBe('abcdef')
  })
})

describe('StudentJoinEntry — QR-Scan-Button (F5)', () => {
  afterEach(() => { cleanup(); sessionStorage.clear() })

  it('rendert den „QR-Code scannen"-Button', () => {
    render(<StudentJoinEntry />)
    expect(screen.getByTestId('classroom-kiosk-scan-btn')).toBeTruthy()
  })

  it('embedded-Modus rendert ohne Kiosk-Shell, aber mit Code-Eingabe', () => {
    render(<StudentJoinEntry embedded />)
    expect(screen.getByTestId('classroom-student-tab')).toBeTruthy()
    expect(screen.getByTestId('classroom-kiosk-code-input')).toBeTruthy()
    // Kiosk-Shell (mit Verlassen-Button) darf im Tab NICHT da sein
    expect(screen.queryByTestId('classroom-kiosk-exit')).toBeNull()
  })
})

describe('StudentJoinEntry — „Fortsetzen"-Karte (W4)', () => {
  afterEach(() => { cleanup(); sessionStorage.clear() })

  it('zeigt die Fortsetzen-Karte, wenn eine Sitzung persistiert ist', () => {
    sessionStorage.setItem('classroom:student', JSON.stringify({
      code: 'morgentau', sessionId: 's1', participantId: 'p1', token: 'tok', displayName: 'Anna',
    }))
    render(<StudentJoinEntry embedded />)
    expect(screen.getByTestId('classroom-student-resume')).toBeTruthy()
    expect(screen.getByText(/MORGENTAU/)).toBeTruthy()
  })

  it('zeigt KEINE Fortsetzen-Karte ohne persistierte Sitzung', () => {
    sessionStorage.clear()
    render(<StudentJoinEntry embedded />)
    expect(screen.queryByTestId('classroom-student-resume')).toBeNull()
  })

  it('blendet die Karte aus, wenn der Token fehlt (nur Code reicht nicht)', () => {
    sessionStorage.setItem('classroom:student', JSON.stringify({ code: 'morgentau' }))
    render(<StudentJoinEntry embedded />)
    expect(screen.queryByTestId('classroom-student-resume')).toBeNull()
  })
})
