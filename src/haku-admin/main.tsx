import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LangProvider } from '../i18n/LangProvider'
import { AuthProvider } from '../platform/lib/auth'
import '../platform/platform.css'
import './admin.css'
import { HakuAdminApp } from './HakuAdminApp'

createRoot(document.getElementById('haku-admin-root')!).render(
  <StrictMode>
    <LangProvider>
      <AuthProvider>
        <HakuAdminApp />
      </AuthProvider>
    </LangProvider>
  </StrictMode>,
)
