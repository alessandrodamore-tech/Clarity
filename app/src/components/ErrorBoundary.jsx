import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Clarity error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, textAlign: 'center',
        }}>
          <div className="bg-mesh" />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--navy)', marginBottom: 8 }}>
              Something went wrong
            </h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
              Try refreshing the page.
            </p>
            <button onClick={() => window.location.reload()} className="btn-primary">
              Refresh
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
