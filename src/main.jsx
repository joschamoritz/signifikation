import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/playfair-display/700.css'
import '@fontsource/playfair-display/800.css'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import './index.css'
import App from './App.jsx'
import TestPage from './TestPage.jsx'

const isTest = window.location.pathname === '/test'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isTest ? <TestPage /> : <App />}
  </StrictMode>,
)
