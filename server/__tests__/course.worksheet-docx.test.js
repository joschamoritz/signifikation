/**
 * server/__tests__/course.worksheet-docx.test.js
 *
 * Tests des DOCX-Renderers (server/course/worksheet/docx.js): editierbares
 * Bonus-Premium-Material aus demselben Content-Modell wie render.js (HTML/PDF).
 * Kein Browser, keine DB: docx.Document → Packer.toBuffer() → als Zip entpackt
 * → Assertions auf den Text in word/document.xml.
 */

import { describe, expect, it } from 'vitest'
import { Packer } from 'docx'
import JSZip from 'jszip'
import { renderWorksheetDocx, renderErwartungshorizontDocx } from '../course/worksheet/docx.js'
import worksheet1 from '../course/worksheet/station-1.js'
import worksheet2 from '../course/worksheet/station-2.js'
import worksheet3 from '../course/worksheet/station-3.js'
import worksheet4 from '../course/worksheet/station-4.js'

async function docxText(doc) {
  const buffer = await Packer.toBuffer(doc)
  expect(Buffer.isBuffer(buffer)).toBe(true)
  expect(buffer.length).toBeGreaterThan(0)
  expect(buffer.slice(0, 2).toString('hex')).toBe('504b') // "PK" — gültiges Zip/DOCX
  const zip = await JSZip.loadAsync(buffer)
  return zip.file('word/document.xml').async('string')
}

describe('Arbeitsblatt DOCX (Station ①, SekI)', () => {
  it('ist ein gültiges DOCX mit Kopf, Wissen, Merke, Fußnote', async () => {
    const xml = await docxText(renderWorksheetDocx(worksheet1, 'SekI'))
    expect(xml).toMatch(/Kollokationen/)
    expect(xml).toMatch(/Sekundarstufe I/)
    expect(xml).toMatch(/Merke/)
    expect(xml).toMatch(/Name:/)
    expect(xml).toMatch(/Datum:/)
    // Fußnoten-Liste (Belege) statt native Word-Fußnoten (Entscheidung §2.3)
    expect(xml).toMatch(/Belege/)
    expect(xml).toMatch(/Hausmann/)
  })

  it('rendert die Kontinuum-Skala als Tabelle', async () => {
    const xml = await docxText(renderWorksheetDocx(worksheet1, 'SekI'))
    expect(xml).toMatch(/Kollokation/)
    expect(xml).toMatch(/Idiom/)
  })
})

describe('Lösung / Erwartungshorizont DOCX (Station ①, SekI)', () => {
  it('enthält Aufgaben-Prompts und Erwartungen', async () => {
    const xml = await docxText(renderErwartungshorizontDocx(worksheet1, 'SekI'))
    expect(xml).toMatch(/Erwartung/)
    expect(xml).toMatch(/Kollokator/)
  })
})

describe('Arbeitsblatt DOCX – Blocktypen der übrigen Stationen', () => {
  it('Felder-Block (Station ②, Feldermodell)', async () => {
    const xml = await docxText(renderWorksheetDocx(worksheet2, 'SekI'))
    expect(xml).toMatch(/Vorfeld/)
  })
  it('Satzbau-Block (Station ③)', async () => {
    const xml = await docxText(renderWorksheetDocx(worksheet3, 'SekI'))
    expect(xml).toMatch(/Subjekt/)
  })
  it('Pipeline-Block (Station ④)', async () => {
    const xml = await docxText(renderWorksheetDocx(worksheet4, 'SekI'))
    expect(xml).toMatch(/Kookkurrenz|Grundform/)
  })
})

describe('Fehlerfall', () => {
  it('wirft bei unbekanntem Niveau', () => {
    expect(() => renderWorksheetDocx(worksheet1, 'Foo')).toThrow()
    expect(() => renderErwartungshorizontDocx(worksheet1, 'Foo')).toThrow()
  })
})
