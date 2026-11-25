import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './noSelect.css'
import App from './App.jsx'
import { applySavedMallangTheme } from './utils/mallangCustomization.js'
import { blockTextSelection } from './noSelect.js'

applySavedMallangTheme()
blockTextSelection()
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
