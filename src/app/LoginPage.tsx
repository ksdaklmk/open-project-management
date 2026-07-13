import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
  }

  const signUp = async () => {
    setError(null)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: name.trim() } },
    })
    if (error) setError(error.message)
  }

  const oauth = async (provider: 'google' | 'github') => {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
    if (error) setError(error.message)
  }

  return (
    <main className="opm-login">
      <section className="opm-login-intro" aria-labelledby="login-product-name">
        <div className="opm-login-mark" aria-hidden="true">
          O
        </div>
        <div>
          <p id="login-product-name">Open Project Management</p>
          <p>Quietly keep every project, task, and handoff in view.</p>
        </div>
      </section>
      <div className="opm-login-panel">
        <form onSubmit={signIn} className="opm-login-form">
          <header>
            <h1>Welcome back</h1>
            <p>Sign in to continue to your workspace.</p>
          </header>
          <label htmlFor="login-email">
            <span>Email</span>
            <input
              id="login-email"
              className="opm-input"
              placeholder="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label htmlFor="login-password">
            <span>Password</span>
            <input
              id="login-password"
              type="password"
              className="opm-input"
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label htmlFor="signup-name">
            <span>
              Name <small>for new accounts</small>
            </span>
            <input
              id="signup-name"
              className="opm-input"
              placeholder="Name (used when signing up)"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="opm-login-error">
              {error}
            </p>
          )}
          <div className="opm-login-actions">
            <button type="submit" className="opm-btn-primary">
              Sign in
            </button>
            <button type="button" onClick={signUp} className="opm-btn">
              Sign up
            </button>
          </div>
          <div className="opm-login-divider">
            <span>or continue with</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => oauth('google')} className="opm-btn">
              Google
            </button>
            <button type="button" onClick={() => oauth('github')} className="opm-btn">
              GitHub
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
