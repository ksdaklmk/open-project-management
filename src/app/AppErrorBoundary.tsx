import { Component, type ErrorInfo, type ReactNode } from 'react'
import { recordTelemetry } from '../lib/observability'

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    recordTelemetry('frontend_exception', {
      operation: 'react_render',
      error_name: error.name,
    })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="min-h-full grid place-items-center bg-[var(--bg)] p-6 text-center text-[var(--text)]">
        <div>
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Reload the page to try again.</p>
          <button type="button" className="opm-btn mt-4" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </main>
    )
  }
}
