import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { ToastProvider } from "@/components/toast/ToastProvider";
import AuthGate from "@/components/AuthGate";

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      return;
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </ToastProvider>
  </StrictMode>,
)
