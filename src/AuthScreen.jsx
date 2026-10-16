import { useState } from 'react'
import './AuthScreen.css'

export default function AuthScreen({ onAuthenticated, googleConfigured = false, initialError = '' }) {
  const [mode, setMode] = useState('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(initialError)

  async function submit(event) {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(mode === 'register' ? { displayName } : {}),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || `Authentication failed (${response.status}).`)
      onAuthenticated(data)
    } catch (authError) {
      setError(authError.message || 'Could not sign you in. Check that the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-heading">
        <div className="auth-brand">
          <span className="auth-brand-mark" aria-hidden="true">✦</span>
          <span>Study<span>AI</span></span>
        </div>
        <div className="auth-heading">
          <span className="study-section-kicker">YOUR PERSONAL STUDY SPACE</span>
          <h1 id="auth-heading">{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h1>
          <p>{mode === 'login' ? 'Sign in to continue learning.' : 'Save your chats and pick up your studies anywhere.'}</p>
        </div>

        {googleConfigured ? (
          <a className="auth-google-button" href="/api/auth/google">
            <span className="auth-google-g" aria-hidden="true">G</span>
            Continue with Google
          </a>
        ) : (
          <button
            className="auth-google-button"
            type="button"
            disabled
            title="Google sign-in needs server OAuth credentials."
          >
            <span className="auth-google-g" aria-hidden="true">G</span>
            Continue with Google
            <span className="auth-google-soon">Not configured</span>
          </button>
        )}
        <div className="auth-divider"><span>or continue with email</span></div>

        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && (
            <label>
              <span>Your name</span>
              <input
                autoComplete="name"
                value={displayName}
                onChange={event => setDisplayName(event.target.value)}
                maxLength={60}
                placeholder="Name"
                disabled={loading}
              />
            </label>
          )}
          <label>
            <span>Email address</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              maxLength={254}
              placeholder="you@example.com"
              required
              disabled={loading}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={event => setPassword(event.target.value)}
              minLength={mode === 'register' ? 10 : undefined}
              maxLength={128}
              placeholder={mode === 'register' ? 'At least 10 characters' : 'Enter your password'}
              required
              disabled={loading}
            />
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            {!loading && <span aria-hidden="true">→</span>}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'login' ? 'New to StudyAI?' : 'Already have an account?'}
          {' '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login')
              setError('')
            }}
          >
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
        <p className="auth-security-note">Your account keeps your study chats private and synced.</p>
      </section>
    </main>
  )
}
