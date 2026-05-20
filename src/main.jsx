import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { installCsrfFetch } from './utils/installCsrfFetch.js'
import App from './App.jsx'

// CSRF-Header für alle State-Changing-Requests setzen, bevor App rendert.
installCsrfFetch()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
