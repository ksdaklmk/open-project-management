import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AuthGate } from './AuthGate'

const mockSession = vi.fn()
vi.mock('../lib/hooks/useSession', () => ({ useSessionContext: () => mockSession() }))
vi.mock('./LoginPage', () => ({ LoginPage: () => <div>login</div> }))

describe('AuthGate', () => {
  it('shows loading state while session is being resolved', () => {
    mockSession.mockReturnValue({ session: null, loading: true })
    render(<AuthGate><div>secret</div></AuthGate>)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('login')).not.toBeInTheDocument()
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })

  it('shows the login page when there is no session', () => {
    mockSession.mockReturnValue({ session: null, loading: false })
    render(<AuthGate><div>secret</div></AuthGate>)
    expect(screen.getByText('login')).toBeInTheDocument()
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })

  it('renders children when a session exists', () => {
    mockSession.mockReturnValue({ session: { user: {} }, loading: false })
    render(<AuthGate><div>secret</div></AuthGate>)
    expect(screen.getByText('secret')).toBeInTheDocument()
  })
})
