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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SessionProvider>
          <AuthGate>
            <WorkspaceProvider>
              <WorkspaceRealtimeProvider>
                <Shell />
              </WorkspaceRealtimeProvider>
            </WorkspaceProvider>
          </AuthGate>
        </SessionProvider>
        <Toaster richColors position="bottom-right" />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
