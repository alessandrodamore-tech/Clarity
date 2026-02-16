import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from './lib/store'
import Layout from './components/Layout'
import Home from './pages/Home'
import DayDetail from './pages/DayDetail'
import Insights from './pages/Insights'
import Trends from './pages/Trends'
import Settings from './pages/Settings'
import Import from './pages/Import'
import Login from './pages/Login'

function ProtectedRoute({ children }) {
  const { user, loading } = useApp()
  
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
        <Route path="insights" element={<Insights />} />
        <Route path="trends" element={<Trends />} />
        <Route path="factors" element={<Navigate to="/app/trends" replace />} />
        <Route path="settings" element={<Settings />} />
        <Route path="import" element={<Import />} />
        <Route path="meds" element={<Navigate to="/app/home" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
