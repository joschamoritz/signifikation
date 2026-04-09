import { Fragment } from 'react'

export default function BelegeSatz({ tokens }) {
  return (
    <p className="beleg-satz">
      {tokens.map((t, i) => (
        <Fragment key={i}>
          {t.ws && ' '}
          {t.hl ? <strong>{t.w}</strong> : t.w}
        </Fragment>
      ))}
    </p>
  )
}
