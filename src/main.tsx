import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import './index.css'
import { getTheme, setTheme } from './lib/theme'
import { queryClient } from './lib/queryClient'
import { AuthGate } from './app/AuthGate'
import { Shell } from './app/Shell'
import { WorkspaceProvider } from './lib/workspace'

setTheme(getTheme())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthGate>
          <WorkspaceProvider>
            <Shell />
          </WorkspaceProvider>
        </AuthGate>
        <Toaster richColors />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
