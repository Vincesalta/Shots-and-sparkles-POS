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
    void navigator.serviceWorker.register('/sw.js?v=8', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((error: unknown) => console.error('Unable to update the customer app service worker:', error))
  })
}
