import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from './lib/store'
import Layout from './components/Layout'
import Home from './pages/Home'
import DayDetail from './pages/DayDetail'
import Trends from './pages/Trends'
import Alerts from './pages/Alerts'
import Settings from './pages/Settings'
import Import from './pages/Import'
import Login from './pages/Login'

function ProtectedRoute({ children }) {
  const { user, loading } = useApp()
  
  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="bg-mesh" />
      <p style={{ fontFamily: 'var(--font-display)', color: 'var(--text-muted)', position: 'relative', zIndex: 1 }}>Loading...</p>
    </div>
  )
  
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
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
  )
}
