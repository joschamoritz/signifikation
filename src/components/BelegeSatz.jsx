export default function BelegeSatz({ tokens }) {
  return (
    <p className="beleg-satz">
      {tokens.map((t, i) => (
        <span key={i}>
          {t.ws ? ' ' : ''}
          {t.hl ? <strong>{t.w}</strong> : t.w}
        </span>
      ))}
    </p>
  )
}
