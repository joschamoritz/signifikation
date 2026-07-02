// K3 (Analyse-2026-07-02): NextStationCta zeigt Glyphen aus dem Server-
// order_no (StationDetail.jsx), springt aber über KURS_MODULES (hier). Beide
// Reihenfolgen müssen übereinstimmen — laufen sie auseinander, zeigt der
// "Weiter zu Station ⑥"-Button einen falschen/leeren Glyphen oder springt zur
// falschen Station. Content-Module sind reine Daten (kein db.js-Import).
import { describe, expect, it } from 'vitest'
import { KURS_MODULES } from './KursTab'
import station1 from '../../server/course/content/station-1.js'
import station2 from '../../server/course/content/station-2.js'
import station3 from '../../server/course/content/station-3.js'
import station4 from '../../server/course/content/station-4.js'
import station5 from '../../server/course/content/station-5.js'

const SERVER_STATIONS = [station1, station2, station3, station4, station5]
  .map((s) => s.station)
  .sort((a, b) => a.orderNo - b.orderNo)

describe('KURS_MODULES vs. Server-order_no (K3)', () => {
  it('hat dieselbe Stations-Reihenfolge wie der Server-Seed', () => {
    const clientOrder = KURS_MODULES.map((m) => m.apiId)
    const serverOrder = SERVER_STATIONS.map((s) => s.id)
    expect(clientOrder).toEqual(serverOrder)
  })

  it('jedes KURS_MODULES-Glyph passt zum Server-order_no', () => {
    const byId = new Map(SERVER_STATIONS.map((s) => [s.id, s.orderNo]))
    for (const [i, mod] of KURS_MODULES.entries()) {
      expect(byId.get(mod.apiId), `${mod.apiId}: Server-Station fehlt`).toBe(i + 1)
    }
  })
})
