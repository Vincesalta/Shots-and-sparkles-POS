import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './CustomerIndex.css'
import CustomerPortal from './CustomerPortal.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CustomerPortal />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}
