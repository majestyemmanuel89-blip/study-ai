import { useState } from 'react'
import RobotAssistant from './RobotAssistant'
import './AuthScreen.css'

function PasswordVisibilityIcon({ visible }) {
  return visible ? (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.5 4.5 9 7-.2 1.1-1 2.4-2.2 3.6M6.2 6.2C3.9 7.7 2.3 10 2 12c.5 2.5 4 7 10 7 1.2 0 2.3-.2 3.3-.6" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export default function AuthScreen({ onAuthenticated, googleConfigured = false, initialError = '' }) {
  const [mode, setMode] = useState('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [error, setError] = useState(initialError)
  const robotMood = passwordFocused ? 'password' : loading ? 'loading' : celebrating ? 'success' : 'idle'

  async function submit(event) {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setPasswordFocused(false)
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

      setCelebrating(true)
      await new Promise(resolve => window.setTimeout(resolve, 650))
      onAuthenticated(data)
    } catch (authError) {
      setError(authError.message || 'Could not sign you in. Check that the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  function switchMode() {
    setMode(current => current === 'login' ? 'register' : 'login')
    setError('')
    setPasswordFocused(false)
    setPasswordVisible(false)
  }

  return (
    <main className="auth-shell">
      <div className="auth-layout">
        <section className="auth-hero" aria-label="StudyAI introduction">
          <div className="auth-brand">
            <span className="auth-brand-mark" aria-hidden="true">✦</span>
            <span>Study<span>AI</span></span>
          </div>
          <RobotAssistant mood={robotMood} attentive={emailFocused} />
          <div className="auth-hero-copy">
            <span className="auth-eyebrow"><span /> YOUR PERSONAL AI STUDY COMPANION</span>
            <h2>Big ideas.<br /><span>Little by little.</span></h2>
            <p>Learn at your pace, ask anything, and make every study session count.</p>
          </div>
          <div className="auth-hero-footnote"><span>✦</span> A little help goes a long way.</div>
        </section>

        <section className="auth-card" aria-labelledby="auth-heading">
          <div className="auth-mobile-brand">
            <span className="auth-brand-mark" aria-hidden="true">✦</span>
            <span>Study<span>AI</span></span>
          </div>
          <div className="auth-card-heading">
            <span className="auth-kicker">{mode === 'login' ? 'YOUR STUDY SPACE' : 'START YOUR JOURNEY'}</span>
            <h1 id="auth-heading">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
            <p>{mode === 'login' ? 'Pick up right where your curiosity left off.' : 'Save your chats and study wherever you go.'}</p>
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
                  placeholder="What should we call you?"
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
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                maxLength={254}
                placeholder="you@example.com"
                required
                disabled={loading}
              />
            </label>
            <label>
              <span>Password</span>
              <span
                className="auth-password-field"
                onBlur={event => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setPasswordFocused(false)
                }}
              >
                <input
                  type={passwordVisible ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  onFocus={() => setPasswordFocused(true)}
                  minLength={mode === 'register' ? 10 : undefined}
                  maxLength={128}
                  placeholder={mode === 'register' ? 'At least 10 characters' : 'Enter your password'}
                  required
                  disabled={loading}
                />
                <button
                  className="auth-password-toggle"
                  type="button"
                  onClick={() => setPasswordVisible(visible => !visible)}
                  aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                  aria-pressed={passwordVisible}
                >
                  <PasswordVisibilityIcon visible={passwordVisible} />
                </button>
              </span>
            </label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? (
                <><span className="auth-submit-spinner" aria-hidden="true" />{mode === 'login' ? 'Signing you in…' : 'Creating your account…'}</>
              ) : (
                <>{mode === 'login' ? 'Sign in' : 'Create account'}<span aria-hidden="true">→</span></>
              )}
            </button>
          </form>

          <p className="auth-switch">
            {mode === 'login' ? 'New to StudyAI?' : 'Already have an account?'}
            {' '}
            <button type="button" onClick={switchMode}>
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
          <p className="auth-security-note"><span aria-hidden="true">⌑</span> Your study chats stay private and synced.</p>
        </section>
      </div>
    </main>
  )
}
