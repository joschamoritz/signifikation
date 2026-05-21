import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { installCsrfFetch } from './utils/installCsrfFetch.js'
import { initNativeBearerToken } from './utils/apiFetch.js'
import App from './App.jsx'

// CSRF-Header für alle State-Changing-Requests setzen, bevor App rendert.
installCsrfFetch()

// Native-Bearer-Token aus dem Keychain in den In-Memory-Cache ziehen, bevor
// die App rendert – sonst läuft die erste /auth/get-session Anfrage ohne
// Authorization-Header und der Nutzer wird scheinbar abgemeldet.
function renderApp() {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

initNativeBearerToken().then(renderApp, renderApp)
