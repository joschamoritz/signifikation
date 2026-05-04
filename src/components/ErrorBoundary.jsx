import { Component } from 'react'
import { logError } from '../utils/logError'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    logError('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="screen" style={{ justifyContent: 'center', alignItems: 'center', gap: 16, padding: '32px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: '2rem' }}>⚠️</p>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: '1.2rem', fontWeight: 700 }}>
            Etwas ist schiefgelaufen
          </p>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted)', maxWidth: 320 }}>
            Ein unerwarteter Fehler ist aufgetreten. Bitte lade die Seite neu.
          </p>
          <button
            className="btn-primary"
            onClick={() => window.location.reload()}
          >
            Seite neu laden
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
