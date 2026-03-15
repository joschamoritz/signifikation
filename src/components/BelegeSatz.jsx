export default function BelegeSatz({ tokens }) {
  return (
    <p className="beleg-satz">
      {tokens.map((t, i) => (
        <span key={i}>
          {t.hl ? <strong>{t.w}</strong> : t.w}
          {t.ws && i < tokens.length - 1 ? ' ' : ''}
        </span>
      ))}
    </p>
  )
}
