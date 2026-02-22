import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from './lib/store'
import { ToastProvider } from './lib/useToast'
import Toast from './components/Toast'

// Eagerly loaded (always needed immediately)
import Layout from './components/Layout'

// Lazy-loaded routes — split into separate chunks
const Home = lazy(() => import('./pages/Home'))
const DayDetail = lazy(() => import('./pages/DayDetail'))
const Trends = lazy(() => import('./pages/Trends'))
const Alerts = lazy(() => import('./pages/Alerts'))
const Settings = lazy(() => import('./pages/Settings'))
const Import = lazy(() => import('./pages/Import'))
const Login = lazy(() => import('./pages/Login'))

// Shared loading fallback
function PageLoader() {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="bg-mesh" />
      <p style={{ fontFamily: 'var(--font-display)', color: 'var(--text-muted)', position: 'relative', zIndex: 1 }}>Loading...</p>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useApp()
  
  if (loading) return <PageLoader />
  
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <ToastProvider>
      <Toast />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/app" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Home />} />
            <Route path="home" element={<Home />} />
            <Route path="day/:date" element={<DayDetail />} />
            <Route path="insights" element={<Navigate to="/app/trends" replace />} />
            <Route path="trends" element={<Trends />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="reminders" element={<Navigate to="/app/alerts" replace />} />
            <Route path="profile" element={<Navigate to="/app/settings" replace />} />
            <Route path="factors" element={<Navigate to="/app/trends" replace />} />
            <Route path="settings" element={<Settings />} />
            <Route path="import" element={<Import />} />
          </Route>
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </Suspense>
    </ToastProvider>
  )
}
