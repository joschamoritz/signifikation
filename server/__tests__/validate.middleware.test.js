/**
 * validate()-Middleware – Query-Pfad.
 *
 * Hintergrund: Express 5 definiert req.query als Getter, der die Query bei
 * jedem Zugriff neu aus der URL parst. Eine In-place-Mutation (wie sie fuer
 * req.params funktioniert) waere dort wirkungslos gewesen – Coercion und
 * Defaults haetten den Handler nie erreicht. Diese Tests halten fest, dass
 * das validierte Ergebnis wirklich ankommt.
 */
import express from 'express'
import { z } from 'zod/v3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { validate } from '../middleware/validate.js'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  flag: z.enum(['a', 'b']).optional().default('a'),
  name: z.string().trim().optional(),
})

describe('validate() – query', () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    app.get('/q', validate(querySchema, 'query'), (req, res) => {
      res.json({
        query: req.query,
        types: Object.fromEntries(Object.entries(req.query).map(([key, value]) => [key, typeof value])),
      })
    })
    app.get('/p/:id', validate(z.object({ id: z.coerce.number().int() }), 'params'), (req, res) => {
      res.json({ params: req.params, type: typeof req.params.id })
    })

    await new Promise((resolve) => { server = app.listen(0, resolve) })
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  afterAll(async () => {
    if (!server) return
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  })

  it('reicht coercierte Zahlen an den Handler durch', async () => {
    const response = await fetch(`${baseUrl}/q?limit=7`)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.query.limit).toBe(7)
    expect(payload.types.limit).toBe('number')
  })

  it('setzt Defaults, wenn der Parameter fehlt', async () => {
    const response = await fetch(`${baseUrl}/q`)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.query).toEqual({ limit: 25, flag: 'a' })
  })

  it('entfernt nicht deklarierte Query-Parameter', async () => {
    const response = await fetch(`${baseUrl}/q?name=Test&unbekannt=x`)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.query.name).toBe('Test')
    expect('unbekannt' in payload.query).toBe(false)
  })

  it('lehnt Werte ausserhalb der Grenzen mit 400 ab', async () => {
    const response = await fetch(`${baseUrl}/q?limit=500`)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(typeof payload.error).toBe('string')
  })

  it('validiert params weiterhin in-place', async () => {
    const response = await fetch(`${baseUrl}/p/42`)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.params.id).toBe(42)
    expect(payload.type).toBe('number')
  })
})
