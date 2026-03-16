import BelegeSatz from './BelegeSatz'

/**
 * Wiederverwendbares Belege-Panel.
 * Zeigt Ladezustand, Ergebnisse oder "Keine Belege" an.
 */
export default function BelegePanel({ lemma, collocate, data, loading }) {
  return (
    <div className="belege-panel">
      <p className="belege-panel-title">
        Belege: <em>{lemma}</em> + <em>{collocate}</em>
      </p>
      {loading && data === undefined ? (
        <p className="belege-status">Lade Belege …</p>
      ) : data?.length ? (
        data.map((b, i) => (
          <div key={i} className="beleg-item">
            <BelegeSatz tokens={b.tokens} />
            <p className="beleg-quelle">{b.quelle}</p>
          </div>
        ))
      ) : (
        <p className="belege-status">Keine Belege gefunden.</p>
      )}
    </div>
  )
}
