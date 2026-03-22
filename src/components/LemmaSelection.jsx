import { useState, useEffect } from 'react'
import { API } from '../config'

export default function LemmaSelection({ lemmata, playedIds = [], onSelect, onViewResult, onBack }) {
  const [closedNotiz, setClosedNotiz] = useState(new Set())
  const [ipaMap, setIpaMap] = useState({})
  const [ipaLoading, setIpaLoading] = useState(new Set(lemmata.map(l => l.lemma)))

  useEffect(() => {
    lemmata.forEach(async l => {
      try {
        const r = await fetch(`${API}/ipa?q=${encodeURIComponent(l.lemma)}`)
        const data = await r.json()
        if (data[0]?.ipa) setIpaMap(m => ({ ...m, [l.lemma]: data[0].ipa }))
      } catch (err) {
        console.error('IPA fetch:', err)
      } finally {
        setIpaLoading(s => { const n = new Set(s); n.delete(l.lemma); return n })
      }
    })
  }, [lemmata])

  return (
    <div className="screen selection-screen">
      <header className="selection-header">
        <button className="back-btn" onClick={onBack} aria-label="Zurück zur Startseite">← Zurück</button>
        <span className="quiz-game-badge">Kollokationen</span>
        <h1 className="sr-only">Wortauswahl</h1>
        <p className="quiz-instruction">Wähle ein Wort und finde seine stärksten Kollokate</p>
      </header>

      <div className="lemma-cards">
        {lemmata.map(lemma => {
          const played = playedIds.includes(lemma.id)
          return (
          <div key={lemma.id} className="lemma-card-wrap">
            <div className={`lemma-card${played ? ' lemma-card--played' : ''}`}>
              <button
                className="lemma-card-main"
                onClick={() => played ? onViewResult?.(lemma.id) : onSelect(lemma)}
              >
                <div className="lemma-info">
                  <span className="lemma-name">{lemma.lemma}</span>
                  {ipaMap[lemma.lemma]
                    ? <span className="lautschrift lemma-ipa">[{ipaMap[lemma.lemma]}]</span>
                    : ipaLoading.has(lemma.lemma) && <span className="lemma-ipa-skeleton" aria-hidden="true" />
                  }
                  <span className="lemma-wortart-chip">{lemma.wortart}</span>
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
                  aria-label="Hinweis anzeigen"
                >i</button>
              )}
            </div>
            {!closedNotiz.has(lemma.id) && lemma.notiz && (
              <div className="lemma-notiz">
                <span>{lemma.notiz}</span>
                {lemma.link && (
                  <a
                    href={lemma.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lemma-notiz-link"
                    aria-label={`Mehr über ${lemma.lemma} erfahren (öffnet externen Link)`}
                  >Mehr →</a>
                )}
              </div>
            )}
          </div>
          )
        })}
      </div>

    </div>
  )
}
