import { useEffect } from 'react'
import { HashRouter } from 'react-router-dom'

import { AuthProvider } from './features/auth/AuthContext'
import { OwnerPushRegistration } from './features/notifications/OwnerPushRegistration'
import { AppRoutes } from './routes/AppRoutes'
import { DocumentTitle } from './routes/DocumentTitle'

export default function App() {
  useEffect(() => {
    document.getElementById('app-starter-loader')?.remove()
  }, [])

  return (
    <AuthProvider>
      <HashRouter>
        <OwnerPushRegistration />
        <DocumentTitle />
        <AppRoutes />
      </HashRouter>
    </AuthProvider>
  )
}
