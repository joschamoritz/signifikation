import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import './index.css'
import './styles/tabbar.css'
import { installCsrfFetch } from './utils/installCsrfFetch.js'
import App from './App.jsx'

// CSRF-Header für alle State-Changing-Requests setzen, bevor App rendert.
installCsrfFetch()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
