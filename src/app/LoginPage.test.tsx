import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { LoginPage } from './LoginPage'

const { mockSignIn, mockSignUp, mockOAuth } = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
  mockSignUp: vi.fn(),
  mockOAuth: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSignIn,
      signUp: mockSignUp,
      signInWithOAuth: mockOAuth,
    },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LoginPage', () => {
  it('renders the error message when sign-in fails', async () => {
    mockSignIn.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } })
    render(<LoginPage />)

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'test@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'wrongpassword' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(screen.getByText('Invalid login credentials')).toBeInTheDocument()
    })
  })

  it('does not call signUp when sign-in fails', async () => {
    mockSignIn.mockResolvedValueOnce({ error: { message: 'Wrong password' } })
    render(<LoginPage />)

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'badpass' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(mockSignIn).toHaveBeenCalled())
    expect(mockSignUp).not.toHaveBeenCalled()
  })

  it('starts OAuth with a redirect back to this app origin', async () => {
    mockOAuth.mockResolvedValueOnce({ error: null })
    render(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Google' }))
    await waitFor(() =>
      expect(mockOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      }),
    )
  })

  it('shows the error when an OAuth provider fails to start', async () => {
    mockOAuth.mockResolvedValueOnce({ error: { message: 'Provider not enabled' } })
    render(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: 'GitHub' }))
    await waitFor(() => expect(screen.getByText('Provider not enabled')).toBeInTheDocument())
  })

  it('passes the name as signup metadata', async () => {
    mockSignUp.mockResolvedValueOnce({ error: null })
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'new@team.dev' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'hunter22' } })
    fireEvent.change(screen.getByPlaceholderText('Name (used when signing up)'), {
      target: { value: '  Kit Klaimak ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    await waitFor(() =>
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'new@team.dev',
        password: 'hunter22',
        options: { data: { name: 'Kit Klaimak' } },
      }),
    )
  })

  it('sign-in ignores the name field', async () => {
    mockSignIn.mockResolvedValueOnce({ error: null })
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.c' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith({ email: 'a@b.c', password: 'pw' }))
  })
})
