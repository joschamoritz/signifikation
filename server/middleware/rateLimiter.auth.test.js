import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loginLimiter, registerLimiter } from './rateLimiter.js'

describe('Auth-Rate-Limiter Integration', () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    app.post('/login', loginLimiter, (_req, res) => res.status(401).json({ error: 'Ungueltig' }))
    app.post('/register', registerLimiter, (_req, res) => res.status(400).json({ error: 'Ungueltig' }))

    await new Promise((resolve) => {
      server = app.listen(0, resolve)
    })

    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    baseUrl = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    if (!server) return
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  })

  it('begrenzt Login nach 10 Versuchen pro 15 Minuten', async () => {
    const ipHeader = { 'x-forwarded-for': '198.51.100.10' }

    for (let i = 0; i < 10; i += 1) {
      const response = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: ipHeader,
      })
      expect(response.status).toBe(401)
    }

    const blockedResponse = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: ipHeader,
    })

    expect(blockedResponse.status).toBe(429)
  })

  it('begrenzt Registrierung nach 8 Versuchen pro 15 Minuten', async () => {
    const ipHeader = { 'x-forwarded-for': '198.51.100.20' }

    for (let i = 0; i < 8; i += 1) {
      const response = await fetch(`${baseUrl}/register`, {
        method: 'POST',
        headers: ipHeader,
      })
      expect(response.status).toBe(400)
    }

    const blockedResponse = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: ipHeader,
    })

    expect(blockedResponse.status).toBe(429)
  })
})
