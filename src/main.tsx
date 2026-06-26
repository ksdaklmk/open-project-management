import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { getTheme, setTheme } from './lib/theme'

setTheme(getTheme()) // apply persisted theme before first paint

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)
