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
    <div className="min-h-full grid place-items-center bg-[var(--bg)]">
      <form
        onSubmit={signIn}
        className="w-80 p-6 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-3"
      >
        <h1 className="text-lg font-semibold text-[var(--text)]">Sign in</h1>
        <input
          className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)]"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)]"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg)]"
          placeholder="Name (used when signing up)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {error && <p style={{ color: 'var(--primary)' }}>{error}</p>}
        <button type="submit" className="w-full py-2 rounded bg-[var(--primary)] text-white">
          Sign in
        </button>
        <button
          type="button"
          onClick={signUp}
          className="w-full py-2 rounded border border-[var(--border)] text-[var(--text)]"
        >
          Sign up
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => oauth('google')}
            className="flex-1 py-2 rounded border border-[var(--border)]"
          >
            Google
          </button>
          <button
            type="button"
            onClick={() => oauth('github')}
            className="flex-1 py-2 rounded border border-[var(--border)]"
          >
            GitHub
          </button>
        </div>
      </form>
    </div>
  )
}
