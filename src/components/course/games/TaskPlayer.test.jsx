// @vitest-environment happy-dom
// Dispatcher-Routing: Payload-Form hat Vorrang vor dem Format-Etikett.
// Regression AP21-QA: Station ④ führt Datenblick-Aufgaben (Tabelle + Fragen)
// teils als F2 — sie müssen trotzdem im DataTask landen, nicht im MarkingTask
// (sonst „keine Inhalte", weil MarkingTask einen sentence erwartet).
import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import TaskPlayer from './TaskPlayer'

afterEach(cleanup)

const base = { id: 't', level: 'SekII', display: { metric: 'none' }, feedback: {}, solution: {} }

describe('TaskPlayer – Routing nach Payload-Form', () => {
  it('F2 mit Tabelle+Fragen → DataTask (nicht leerer MarkingTask)', () => {
    const task = {
      ...base, format: 'F2',
      payload: {
        table: [{ verbindung: 'blond', frequency: 530, logDice: 10.6 }],
        columns: ['verbindung', 'frequency', 'logDice'],
        questions: [{ id: 'q1', text: 'Welche ist am häufigsten?', kind: 'pick-row' }],
      },
      solution: { answers: { q1: 'blond' } },
    }
    const { container } = render(<TaskPlayer task={task} index="1" />)
    expect(container.querySelector('.course-task--data')).toBeTruthy()
    expect(container.querySelector('table.course-data-table')).toBeTruthy()
    expect(container.querySelector('.course-task--marking')).toBeNull()
  })

  it('F2 mit sentence → MarkingTask', () => {
    const task = {
      ...base, format: 'F2',
      payload: { sentence: 'Sie hat blonde Haare.', markTask: 'kollokation' },
      solution: { spans: [{ tokenRange: [3, 5], label: 'oft' }] },
    }
    const { container } = render(<TaskPlayer task={task} index="1" />)
    expect(container.querySelector('.course-task--marking')).toBeTruthy()
  })
})
