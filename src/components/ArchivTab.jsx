import { memo, useState, useEffect, useCallback, useMemo } from 'react'
import TabHeader from './TabHeader'
import MusterNetz from './archiv/MusterNetz'
import { apiGet } from '../api/client'
import { API } from '../config'
import '../styles/archiv.css'

// Mobil weniger Knoten, damit die Labels nicht überlappen.
function useMaxNodes() {
  const [n, setN] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 560 ? 4 : 6))
  useEffect(() => {
    const onResize = () => setN(window.innerWidth < 560 ? 4 : 6)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return n
}

// Typische Stellung des Partnerworts relativ zum Stichwort (Server: REL_POSITION).
const STELLUNG_LABEL = { vor: '‹ davor', nach: 'danach ›', variabel: '↔ frei' }

/** Ein Beleg als Keyword-in-Context, sonst als schlichtes Zitat. */
function Beleg({ b }) {
  return (
    <figure className="av-beleg">
      {b.kwic ? (
        <div className="av-kwic-line">
          <span className="av-kwic-left">{b.kwic.left}</span>
          <span className="av-kwic-key">{b.kwic.keyword}</span>
          <span className="av-kwic-right">{b.kwic.right}</span>
        </div>
      ) : (
        <blockquote className="av-beleg-satz">{b.satz}</blockquote>
      )}
      {b.quelle ? <figcaption className="av-beleg-quelle">{b.quelle}</figcaption> : null}
    </figure>
  )
}

/** Detail-Ansicht eines Worts: Muster-Tabelle, Wortnetz, KWiC-Belege. */
function WortDetail({ data, loading, onBack }) {
  const maxNodes = useMaxNodes()
  const patterns = data?.detail?.patterns || []
  const netz = data?.detail?.netz || []
  const belege = data?.detail?.belege || []
  return (
    <div className="av-detail">
      <button type="button" className="av-back" onClick={onBack}>‹ Archiv</button>
      {loading || !data ? (
        <p className="av-loading">Lädt …</p>
      ) : (
        <>
          <article className="av-entry">
            <p className="av-overline">Wörterbuch-Archiv</p>
            <h2 className="av-headword">
              {data.lemma}
              {data.ipa ? <span className="av-ipa"> [{data.ipa}]</span> : null}
            </h2>
            {data.wortart ? <span className="av-pos">{data.wortart}</span> : null}
            {data.definitionen?.length ? (
              <ol className={`av-defs${data.definitionen.length === 1 ? ' single' : ''}`}>
                {data.definitionen.map((d, i) => <li key={i}>{d}</li>)}
              </ol>
            ) : null}
          </article>

          {patterns.length ? (
            <section className="av-block">
              <p className="av-block-label">Musternetz</p>
              <MusterNetz lemma={data.lemma} patterns={patterns} netz={netz} maxNodes={maxNodes} />
            </section>
          ) : null}

          {patterns.length ? (
            <section className="av-block">
              <p className="av-block-label">Syntagmatische Muster</p>
              <p className="av-muster-intro">Die typischsten Verbindungen von „{data.lemma}" im Korpus:</p>
              <div className="av-mt-scroll">
                <table className="av-muster-tabelle">
                  <thead>
                    <tr>
                      <th scope="col">Partnerwort</th>
                      <th scope="col">Beziehung</th>
                      <th scope="col">Stellung</th>
                      <th scope="col" className="av-mt-num">Anteil</th>
                      <th scope="col" className="av-mt-num">Frequenz</th>
                      <th scope="col" className="av-mt-num">logDice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patterns.map((p, i) => (
                      <tr key={i}>
                        <td className="av-mt-koll">{p.kollokator}</td>
                        <td className="av-mt-rel">
                          {p.muster}{p.prep ? <span className="av-mt-prep"> ({p.prep})</span> : null}
                        </td>
                        <td className="av-mt-pos">{STELLUNG_LABEL[p.stellung] || p.stellung}</td>
                        <td className="av-mt-num">{p.anteil}&#8239;%</td>
                        <td className="av-mt-num">{p.frequency.toLocaleString('de-DE')}</td>
                        <td className="av-mt-num">{p.logDice.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="av-mt-legende">
                <strong>logDice</strong> misst die Stärke der Verbindung (höher = typischer, theoret. Maximum 14).{' '}
                <strong>Frequenz</strong> ist die absolute Häufigkeit im Korpus.{' '}
                <strong>Anteil</strong> ist der Anteil dieser Verbindung an allen erfassten Verbindungen des Stichworts.{' '}
                <strong>Stellung</strong> ist die typische Position des Partnerworts relativ zum Stichwort.
              </p>
            </section>
          ) : null}

          {netz.length ? (
            <section className="av-block">
              <p className="av-block-label">Wortnetz</p>
              <p className="av-netz-intro">Womit sich die stärksten Partnerwörter von „{data.lemma}" ihrerseits verbinden:</p>
              <ul className="av-netz-list">
                {netz.map((n, i) => (
                  <li key={i}>
                    <span className="av-netz-base">{n.base}</span>
                    <span className="av-netz-arrow" aria-hidden="true"> → </span>
                    {n.collocates.map((c) => c.kollokator).join(' · ')}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {belege.length ? (
            <section className="av-block">
              <p className="av-block-label">Aus dem Korpus</p>
              {belege.map((b, i) => <Beleg key={i} b={b} />)}
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}

function ArchivTab() {
  const [woerter, setWoerter] = useState(null) // null = lädt
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null) // slug
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    let alive = true
    apiGet(`${API}/woerter`)
      .then((d) => { if (alive) setWoerter(d.woerter || []) })
      .catch((e) => { if (alive) setError(e) })
    return () => { alive = false }
  }, [])

  const openWort = useCallback((slug) => {
    setSelected(slug)
    setDetail(null)
    setDetailLoading(true)
    apiGet(`${API}/woerter/${slug}`)
      .then((d) => { setDetail(d); setDetailLoading(false) })
      .catch(() => { setDetailLoading(false) })
  }, [])

  const closeWort = useCallback(() => { setSelected(null); setDetail(null) }, [])

  // Alphabetisch gruppiert (nach erstem Buchstaben), lokal gefiltert.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (woerter || []).filter((w) => !q || w.lemma.toLowerCase().includes(q))
    const map = new Map()
    for (const w of list) {
      const letter = (w.lemma[0] || '#').toUpperCase()
      if (!map.has(letter)) map.set(letter, [])
      map.get(letter).push(w)
    }
    return [...map.entries()]
  }, [woerter, query])

  if (selected) {
    return (
      <div className="test-page archiv-page">
        <TabHeader />
        <div className="test-wrapper">
          <WortDetail data={detail} loading={detailLoading} onBack={closeWort} />
        </div>
      </div>
    )
  }

  const count = woerter?.length || 0

  return (
    <div className="test-page archiv-page">
      <TabHeader />
      <div className="test-wrapper">
        {/* Header-Band (desktop-only via .test-raster) – Einheitlichkeit mit den
            anderen Tabs; Titel steckt im Band-Label, kein separater h2. */}
        <nav className="test-raster" aria-label="Archiv">
          <span className="test-raster-label" aria-hidden="true">Archiv</span>
          <div className="test-raster-words">
            <span className="test-raster-word">Nachschlagen</span>
          </div>
          <div className="test-raster-end">
            <span className="test-raster-folio" aria-hidden="true">
              {count > 0 ? `${count} ${count === 1 ? 'Eintrag' : 'Einträge'}` : ''}
            </span>
          </div>
        </nav>
        <div className="test-rule--double" role="separator" aria-hidden="true" />

        <div className="av-search-wrap">
          <svg className="av-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.8-3.8" />
          </svg>
          <input
            type="search"
            className="av-search"
            placeholder="Wort suchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Wort im Archiv suchen"
          />
        </div>

        {error ? (
          <p className="av-empty">Archiv derzeit nicht verfügbar.</p>
        ) : woerter === null ? (
          <p className="av-empty">Lädt …</p>
        ) : groups.length === 0 ? (
          <p className="av-empty">{query ? 'Kein Treffer.' : 'Noch keine Archiv-Einträge.'}</p>
        ) : (
          <div className="av-list">
            {groups.map(([letter, items]) => (
              <div key={letter} className="av-group">
                <p className="av-group-letter">{letter}</p>
                <ul className="av-index-list">
                  {items.map((w) => (
                    <li key={w.slug}>
                      <button type="button" className="av-index-item" onClick={() => openWort(w.slug)}>
                        <span className="av-index-word">
                          {w.lemma}
                          {w.ipa ? <span className="av-ipa"> [{w.ipa}]</span> : null}
                        </span>
                        {w.definition ? <span className="av-index-def">{w.definition}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(ArchivTab)
