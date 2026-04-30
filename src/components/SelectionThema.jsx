function isUrl(str) {
  return str.startsWith('http://') || str.startsWith('https://')
}

export default function SelectionThema({ thema, themaKurz, themaQuelle }) {
  if (!thema) return null
  return (
    <div className="selection-thema-block">
      <span className="selection-thema-label">Thema des Tages</span>
      <hr className="selection-thema-rule" aria-hidden="true" />
      <p className="selection-thema">{thema}</p>
      {themaKurz && (
        <p className="selection-thema-kurz">{themaKurz}</p>
      )}
      {themaQuelle && (
        <p className="selection-thema-quelle">
          {isUrl(themaQuelle)
            ? <a href={themaQuelle} target="_blank" rel="noopener noreferrer">{themaQuelle}</a>
            : themaQuelle
          }
        </p>
      )}
    </div>
  )
}
