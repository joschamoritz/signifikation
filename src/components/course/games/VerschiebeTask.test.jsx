// @vitest-environment happy-dom
// Verschiebeprobe (Feldermodell): genau ein gültiges Satzglied ins Vorfeld →
// richtig; ein Nicht-Satzglied oder mehrere Chunks → falsch.
import { render, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VerschiebeTask from './VerschiebeTask'

afterEach(cleanup)

const TASK = {
  id: 'vs1',
  level: 'SekI',
  payload: {
    verb: { id: 'vb', text: 'sucht' },
    chunks: [
      { id: 'c1', text: 'Der Hund', role: 'Subjekt' },
      { id: 'c2', text: 'im Garten', role: 'adv' },
      { id: 'c3', text: 'einen Ball', role: 'Objekt' },
      { id: 'c4', text: 'Ball einen', role: 'kein-satzglied' }, // Distraktor
    ],
  },
  solution: { validVorfeld: ['c1', 'c2', 'c3'] },
  feedback: { onCorrect: 'Stark.' },
  display: { metric: 'none' },
}

const chunkByText = (t) =>
  [...document.querySelectorAll('.course-chunk')].find((el) => el.textContent.trim() === t)
const vorfeldZone = () => document.querySelector('[data-zone="vorfeld"]')
const checkBtn = () => document.querySelector('.course-check-btn')
const pick = (text) => fireEvent.keyDown(chunkByText(text), { key: 'Enter' })
const dropVorfeld = () => fireEvent.click(vorfeldZone())

describe('VerschiebeTask – Verschiebeprobe', () => {
  it('genau ein gültiges Satzglied im Vorfeld → onChecked(true)', () => {
    const onChecked = vi.fn()
    render(<VerschiebeTask task={TASK} index="1" onChecked={onChecked} />)
    pick('Der Hund'); dropVorfeld()
    fireEvent.click(checkBtn())
    expect(onChecked).toHaveBeenCalledWith(true)
  })

  it('Nicht-Satzglied im Vorfeld → onChecked(false)', () => {
    const onChecked = vi.fn()
    render(<VerschiebeTask task={TASK} index="1" onChecked={onChecked} />)
    pick('Ball einen'); dropVorfeld()
    fireEvent.click(checkBtn())
    expect(onChecked).toHaveBeenCalledWith(false)
  })

  it('zwei Satzglieder im Vorfeld → onChecked(false)', () => {
    const onChecked = vi.fn()
    render(<VerschiebeTask task={TASK} index="1" onChecked={onChecked} />)
    pick('Der Hund'); dropVorfeld()
    pick('im Garten'); dropVorfeld()
    fireEvent.click(checkBtn())
    expect(onChecked).toHaveBeenCalledWith(false)
  })
})
