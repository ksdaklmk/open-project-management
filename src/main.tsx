import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import './index.css'
import { queryClient } from './lib/queryClient'
import { SessionProvider } from './lib/hooks/useSession'
import { AuthGate } from './app/AuthGate'
import { Shell } from './app/Shell'
import { WorkspaceProvider } from './lib/workspace'
import { WorkspaceRealtimeProvider } from './lib/realtime/WorkspaceRealtimeProvider'
import { AppErrorBoundary } from './app/AppErrorBoundary'
import { initializeObservability } from './lib/observability'
import { FEATURES } from './lib/features'

initializeObservability()

const RealtimeBoundary = FEATURES.realtime ? WorkspaceRealtimeProvider : React.Fragment

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <SessionProvider>
            <AuthGate>
              <WorkspaceProvider>
                <RealtimeBoundary>
                  <Shell />
                </RealtimeBoundary>
              </WorkspaceProvider>
            </AuthGate>
          </SessionProvider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'var(--surface-raised)',
                color: 'var(--text)',
                border: '1px solid var(--border-strong)',
              },
            }}
          />
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
)
