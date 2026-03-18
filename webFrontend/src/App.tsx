import { HashRouter } from 'react-router-dom'

import { AuthProvider } from './features/auth/AuthContext'
import { AppRoutes } from './routes/AppRoutes'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AuthProvider>
  )
}
