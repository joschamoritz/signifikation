export default function SelectionThema({ thema }) {
  if (!thema) return null
  return (
    <div className="selection-thema-block">
      <span className="selection-thema-label">Thema des Tages</span>
      <hr className="selection-thema-rule" aria-hidden="true" />
      <p className="selection-thema">{thema}</p>
    </div>
  )
}
