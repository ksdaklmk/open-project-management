import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { LoginPage } from './LoginPage'

const { mockSignIn, mockSignUp } = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
  mockSignUp: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSignIn,
      signUp: mockSignUp,
      signInWithOAuth: vi.fn(),
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
})
