// @vitest-environment happy-dom
// ExternalLink und openUrl öffnen nur Webadressen (Security-Audit run-1): Links kommen aus den
// Spieldaten, ein javascript:- oder intent:-Link darf weder als href stehen noch geöffnet werden.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))
import ExternalLink from './ExternalLink'
import { istWebLink, openUrl } from '../utils/openUrl'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ExternalLink / openUrl', () => {
  it('erkennt nur http(s) als Webadresse', () => {
    expect(istWebLink('https://www.dwds.de/')).toBe(true)
    expect(istWebLink('HTTP://example.org')).toBe(true)
    for (const kaputt of ['javascript:alert(1)', 'intent://x#Intent;end', 'wetteronline.de/', '', null, undefined]) {
      expect(istWebLink(kaputt)).toBe(false)
    }
  })

  it('setzt href und öffnet nur bei http(s)', () => {
    const offen = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<><ExternalLink href="javascript:alert(1)">böse</ExternalLink><ExternalLink href="https://www.dwds.de/">gut</ExternalLink></>)

    const boese = screen.getByText('böse')
    expect(boese.getAttribute('href')).toBeNull()
    fireEvent.click(boese)
    expect(offen).not.toHaveBeenCalled()

    const gut = screen.getByText('gut')
    expect(gut.getAttribute('href')).toBe('https://www.dwds.de/')
    fireEvent.click(gut)
    expect(offen).toHaveBeenCalledWith('https://www.dwds.de/', '_blank', 'noopener,noreferrer')
  })

  it('openUrl ignoriert Nicht-Webadressen', async () => {
    const offen = vi.spyOn(window, 'open').mockImplementation(() => null)
    await openUrl('javascript:alert(1)')
    expect(offen).not.toHaveBeenCalled()
  })
})
