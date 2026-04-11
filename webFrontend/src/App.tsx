import { HashRouter } from 'react-router-dom'

import { AuthProvider } from './features/auth/AuthContext'
import { AppRoutes } from './routes/AppRoutes'
import { DocumentTitle } from './routes/DocumentTitle'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <DocumentTitle />
        <AppRoutes />
      </HashRouter>
    </AuthProvider>
  )
}
