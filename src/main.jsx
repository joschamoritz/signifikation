import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import './index.css'
import { installCsrfFetch } from './utils/installCsrfFetch.js'
import { initSentry } from './utils/sentry.js'
import App from './App.jsx'

// Sentry initialisieren BEVOR die App rendert, damit auch Mount-Fehler
// erfasst werden. No-Op falls VITE_SENTRY_DSN nicht gesetzt.
initSentry()
// CSRF-Header für alle State-Changing-Requests setzen, bevor App rendert.
installCsrfFetch()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
