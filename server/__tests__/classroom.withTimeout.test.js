import { describe, it, expect } from 'vitest'
import { withTimeout } from '../classroom/withTimeout.js'

describe('withTimeout', () => {
  it('lehnt nach Ablauf ab (hängendes Promise)', async () => {
    await expect(withTimeout(new Promise(() => {}), 20, 'test')).rejects.toThrow(/Timeout/)
  })

  it('liefert das Ergebnis, wenn rechtzeitig aufgelöst', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, 'test')).resolves.toBe(42)
  })

  it('propagiert einen echten Reject vor dem Timeout', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000, 'test')).rejects.toThrow('boom')
  })
})
