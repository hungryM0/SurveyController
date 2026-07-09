import React from 'react'
import ReactDOM from 'react-dom/client'
import './components/ui/ui.css'
import './style.css'
import App from './App'

const root = document.getElementById('app')

if (!root) {
  throw new Error('Root element #app was not found')
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
