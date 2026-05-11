import { useState, useEffect } from 'react'
import { API } from '../config'
import SelectionThema from './SelectionThema'
import { logError } from '../utils/logError'
import ExternalLink from './ExternalLink'


export default function LemmaSelection({ lemmata, thema, themaKurz, themaQuelle, playedIds = [], onSelect, onViewResult, onBack, spezialLemma = null, spezialwoche = null }) {
  const [closedNotiz, setClosedNotiz] = useState(() => new Set(lemmata.map(l => l.id)))
  // Lemmata mit gespeicherter IPA direkt ins Map laden; Rest per API nachholen
  const [ipaMap, setIpaMap] = useState(() => {
    const entries = lemmata.filter(l => l.ipa).map(l => [l.lemma, l.ipa])
    if (spezialLemma?.ipa) entries.push([spezialLemma.lemma, spezialLemma.ipa])
    return Object.fromEntries(entries)
  })
  const [ipaLoading, setIpaLoading] = useState(
    () => new Set(lemmata.filter(l => !l.ipa).map(l => l.lemma))
  )

  // spezialLemma.ipa kommt server-seitig mit → direkt in Map übernehmen
  useEffect(() => {
    if (spezialLemma?.ipa) setIpaMap(m => ({ ...m, [spezialLemma.lemma]: spezialLemma.ipa }))
  }, [spezialLemma?.ipa, spezialLemma?.lemma])

  useEffect(() => {
    const toFetch = [...lemmata, ...(spezialLemma ? [spezialLemma] : [])].filter(l => !l.ipa)
    if (!toFetch.length) return

    const controller = new AbortController()
    const { signal } = controller

    Promise.all(toFetch.map(async l => {
      try {
        const r    = await fetch(`${API}/ipa?q=${encodeURIComponent(l.lemma)}`, { signal })
        const data = await r.json()
        if (data[0]?.ipa) setIpaMap(m => ({ ...m, [l.lemma]: data[0].ipa }))
      } catch (err) {
        if (err.name !== 'AbortError') logError('IPA fetch fehlgeschlagen', err, { lemma: l.lemma })
      } finally {
        setIpaLoading(s => { const n = new Set(s); n.delete(l.lemma); return n })
      }
    }))

    return () => controller.abort()
  }, [lemmata, spezialLemma])

  return (
    <div className="screen selection-screen">
      <header className="selection-header">
        <button className="back-btn" type="button" onClick={onBack} aria-label="Zurück zur Startseite"><svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true"><path d="M8.5 1L1.5 8L8.5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
        <span className="quiz-game-badge">Kollokationen</span>
        <h1 className="sr-only">Wortauswahl</h1>
        <SelectionThema thema={thema} themaKurz={themaKurz} themaQuelle={themaQuelle} />
      </header>

      <div className="lemma-cards">
        {/* ── Tägliche Lemmata ─── */}
        {lemmata.map(lemma => {
          const played = playedIds.includes(lemma.id)
          return (
          <div key={lemma.id} className="lemma-card-wrap">
            <div className={`lemma-card${played ? ' lemma-card--played' : ''}`}>
              <button
                className="lemma-card-main"
                type="button"
                onClick={() => played ? onViewResult?.(lemma.id) : onSelect(lemma)}
                aria-label={played ? `${lemma.lemma} – Ergebnis ansehen` : `${lemma.lemma} spielen`}
              >
                <div className="lemma-info">
                  <div className="lemma-header-row">
                    <span className="lemma-name">{lemma.lemma}</span>
                    {ipaMap[lemma.lemma]
                      ? <span className="lautschrift lemma-ipa">[{ipaMap[lemma.lemma]}]</span>
                      : ipaLoading.has(lemma.lemma) && <span className="lemma-ipa-skeleton" aria-hidden="true" />
                    }
                    <span className="lemma-wortart-abbrev">{lemma.wortart}</span>
                  </div>
                  {(lemma.definitionen?.length > 0 || lemma.definition) && (
                    <div className="lemma-definition">
                      {lemma.definitionen?.length > 0
                        ? lemma.definitionen.slice(0, 3).map((d, i) => <p key={i}>{d}</p>)
                        : <p>{lemma.definition}</p>
                      }
                    </div>
                  )}
                </div>
                <span className="lemma-arrow">{played ? '›' : '›'}</span>
              </button>
              {lemma.notiz && (
                <button
                  className={`lemma-info-btn ${!closedNotiz.has(lemma.id) ? 'lemma-info-btn--active' : ''}`}
                  onClick={() => setClosedNotiz(s => {
                    const n = new Set(s)
                    n.has(lemma.id) ? n.delete(lemma.id) : n.add(lemma.id)
                    return n
                  })}
                  aria-label={`Hinweis zu ${lemma.lemma} ${!closedNotiz.has(lemma.id) ? 'ausblenden' : 'anzeigen'}`}
                  aria-expanded={!closedNotiz.has(lemma.id)}
                >i</button>
              )}
            </div>
            {!closedNotiz.has(lemma.id) && lemma.notiz && (
              <div className="lemma-notiz">
                <span>{lemma.notiz}</span>
                {lemma.link && (
                  <ExternalLink
                    href={lemma.link}
                    className="lemma-notiz-link"
                    aria-label={`Mehr über ${lemma.lemma} erfahren (öffnet externen Link)`}
                  >Mehr →</ExternalLink>
                )}
              </div>
            )}
          </div>
          )
        })}
        {/* ── Wort der Woche (abgesetzt) ─── */}
        {spezialLemma && (
          <>
            <div className="lemma-cards-spezial-divider" role="separator" aria-label="Wort der Woche">
              <span className="lemma-cards-spezial-label">✦ Wort der Woche</span>
            </div>
            <div className="lemma-card-wrap">
              <div className={`lemma-card lemma-card--spezial${playedIds.includes(spezialLemma.id) ? ' lemma-card--played' : ''}`}>
                <button
                  className="lemma-card-main"
                  type="button"
                  onClick={() =>
                    playedIds.includes(spezialLemma.id)
                      ? onViewResult?.(spezialLemma.id)
                      : onSelect(spezialLemma)
                  }
                  aria-label={
                    playedIds.includes(spezialLemma.id)
                      ? `${spezialLemma.lemma} – Ergebnis ansehen`
                      : `${spezialLemma.lemma} spielen`
                  }
                >
                  <div className="lemma-info">
                    <div className="lemma-header-row">
                      <span className="lemma-name">{spezialLemma.lemma}</span>
                      {ipaMap[spezialLemma.lemma]
                        ? <span className="lautschrift lemma-ipa">[{ipaMap[spezialLemma.lemma]}]</span>
                        : ipaLoading.has(spezialLemma.lemma) && <span className="lemma-ipa-skeleton" aria-hidden="true" />
                      }
                      <span className="lemma-wortart-abbrev">{spezialLemma.wortart}</span>
                    </div>
                    {(spezialLemma.definitionen?.length > 0 || spezialLemma.definition) && (
                      <div className="lemma-definition">
                        {spezialLemma.definitionen?.length > 0
                          ? spezialLemma.definitionen.slice(0, 2).map((d, i) => <p key={i}>{d}</p>)
                          : <p>{spezialLemma.definition}</p>
                        }
                      </div>
                    )}
                  </div>
                  <span className="lemma-arrow" aria-hidden="true">›</span>
                </button>
                {spezialLemma.notiz && (
                  <button
                    className={`lemma-info-btn ${!closedNotiz.has(spezialLemma.id) ? 'lemma-info-btn--active' : ''}`}
                    onClick={() => setClosedNotiz(s => {
                      const n = new Set(s)
                      n.has(spezialLemma.id) ? n.delete(spezialLemma.id) : n.add(spezialLemma.id)
                      return n
                    })}
                    aria-label={`Hinweis zu ${spezialLemma.lemma} ${!closedNotiz.has(spezialLemma.id) ? 'ausblenden' : 'anzeigen'}`}
                    aria-expanded={!closedNotiz.has(spezialLemma.id)}
                  >i</button>
                )}
              </div>
              {!closedNotiz.has(spezialLemma.id) && spezialLemma.notiz && (
                <div className="lemma-notiz">
                  <span>{spezialLemma.notiz}</span>
                  {spezialLemma.link && (
                    <ExternalLink
                      href={spezialLemma.link}
                      className="lemma-notiz-link"
                      aria-label={`Mehr über ${spezialLemma.lemma} erfahren (öffnet externen Link)`}
                    >Mehr →</ExternalLink>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

    </div>
  )
}
