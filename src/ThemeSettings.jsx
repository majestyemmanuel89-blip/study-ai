import { useState } from 'react'
import { DARK_THEMES, DEFAULT_THEME_ID, getDarkTheme } from './themes'
import './ThemeSettings.css'

export default function ThemeSettings({ user, theme, csrfToken, onThemeChange, onNavigate }) {
  const canCustomize = user.role === 'admin' || user.plan === 'premium' || user.plan === 'pro'
  const accessLabel = user.role === 'admin'
    ? 'Administrator · Pro access'
    : `${user.plan === 'pro' ? 'Pro' : 'Premium'} access · changes are saved to your account`
  const appliedTheme = getDarkTheme(canCustomize ? theme.id : DEFAULT_THEME_ID)
  const [previewId, setPreviewId] = useState(() => appliedTheme.id)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const previewTheme = getDarkTheme(previewId)

  async function applyTheme(themeId) {
    if (!canCustomize) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/account/theme', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ id: themeId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || `Could not apply theme (${response.status}).`)
      if (!DARK_THEMES.some(candidate => candidate.id === data.theme?.id)) {
        throw new Error('The account server returned an invalid theme.')
      }
      onThemeChange(data.theme)
      setPreviewId(data.theme.id)
      setNotice(`${getDarkTheme(data.theme.id).name} is now your StudyAI theme.`)
    } catch (saveError) {
      setError(saveError.message || 'Could not save your theme.')
    } finally {
      setSaving(false)
    }
  }

  function resetTheme() {
    setPreviewId(DEFAULT_THEME_ID)
    if (canCustomize) applyTheme(DEFAULT_THEME_ID)
  }

  return (
    <section className="study-subview theme-settings-page" aria-labelledby="theme-studio-title">
      <div className="study-subview-heading theme-studio-page-heading">
        <span className="study-section-kicker">MAKE IT YOURS</span>
        <h1 id="theme-studio-title">Dark Theme Studio</h1>
        <p>Explore eight carefully tuned dark palettes for your StudyAI workspace.</p>
      </div>

      <section
        className="theme-studio-preview"
        aria-label={`Live preview: ${previewTheme.name}`}
        style={{
          '--preview-bg': previewTheme.background,
          '--preview-surface': previewTheme.surface,
          '--preview-raised': previewTheme.raised,
          '--preview-border': previewTheme.border,
          '--preview-accent': previewTheme.accent,
        }}
      >
        <div className="theme-studio-preview-sidebar">
          <span className="theme-preview-logo" />
          <span className="theme-preview-nav is-active" />
          <span className="theme-preview-nav" />
          <span className="theme-preview-nav" />
        </div>
        <div className="theme-studio-preview-main">
          <div className="theme-preview-topbar"><span /><span /></div>
          <div className="theme-preview-content">
            <span className="theme-preview-kicker">YOUR STUDY SPACE</span>
            <strong>{previewTheme.name}</strong>
            <span className="theme-preview-copy" />
            <div className="theme-preview-cards">
              <span><i /><i /><i /></span>
              <span><i /><i /><i /></span>
            </div>
          </div>
        </div>
        <div className="theme-preview-caption">
          <span><i /> Live preview</span>
          <strong>{previewTheme.name}</strong>
        </div>
      </section>

      {!canCustomize && (
        <aside className="theme-access-notice" role="note">
          <span className="theme-lock-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="5" y="10" width="14" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
            </svg>
          </span>
          <div>
            <strong>Preview all themes. Premium and Pro activation is locked.</strong>
            <p>Apply a Premium or Pro plan through Plans & Pricing, or ask an administrator to assign access to your account.</p>
            <button className="theme-plans-link" type="button" onClick={() => onNavigate('plans')}>
              View plans <span aria-hidden="true">→</span>
            </button>
          </div>
        </aside>
      )}

      <div className="theme-studio-toolbar">
        <div>
          <h2>Choose a palette</h2>
          <p>{canCustomize ? accessLabel : 'Select any card to preview it; activation is currently unavailable for Free accounts.'}</p>
        </div>
        <button
          className="theme-reset-button"
          type="button"
          onClick={resetTheme}
          disabled={saving || (previewId === DEFAULT_THEME_ID && appliedTheme.id === DEFAULT_THEME_ID)}
        >
          Reset to Midnight
        </button>
      </div>

      <div className="theme-studio-grid">
        {DARK_THEMES.map(palette => {
          const selected = canCustomize && appliedTheme.id === palette.id
          const previewing = previewTheme.id === palette.id
          return (
            <article
              className={`theme-choice${selected ? ' is-selected' : ''}${previewing ? ' is-previewing' : ''}`}
              key={palette.id}
              style={{
                '--card-bg': palette.background,
                '--card-surface': palette.surface,
                '--card-raised': palette.raised,
                '--card-border': palette.border,
                '--card-accent': palette.accent,
              }}
            >
              <button
                className="theme-choice-preview"
                type="button"
                onClick={() => setPreviewId(palette.id)}
                aria-label={`Preview ${palette.name} theme`}
                aria-pressed={previewing}
              >
                <span className="theme-card-topbar">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="theme-card-layout">
                  <span className="theme-card-sidebar">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="theme-card-main">
                    <i />
                    <i />
                    <i />
                  </span>
                </span>
                <span className="theme-card-name">{palette.name}</span>
                <span className="theme-card-check" aria-hidden="true">{selected ? '✓' : ''}</span>
                {!canCustomize && (
                  <span className="theme-card-lock" aria-label="Locked for Free accounts">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="5" y="10" width="14" height="11" rx="2" />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                    </svg>
                  </span>
                )}
              </button>

              <div className="theme-choice-info">
                <div className="theme-choice-title">
                  <h3>{palette.name}</h3>
                  <span className={`theme-availability${canCustomize ? ' is-available' : ' is-locked'}`}>
                    {canCustomize ? selected ? 'Active' : 'Available' : 'Premium'}
                  </span>
                </div>
                <p>{palette.description}</p>
                <div className="theme-color-swatches" aria-label="Background, surface and accent colors">
                  <span style={{ background: palette.background }} title={`Background ${palette.background}`} />
                  <span style={{ background: palette.surface }} title={`Surface ${palette.surface}`} />
                  <span style={{ background: palette.accent }} title={`Accent ${palette.accent}`} />
                  <code>{palette.background} · {palette.surface} · {palette.accent}</code>
                </div>
                {canCustomize ? (
                  <button
                    className={`theme-activate-button${selected ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => applyTheme(palette.id)}
                    disabled={saving || selected}
                  >
                    {saving && previewId === palette.id ? 'Applying…' : selected ? 'Currently active' : 'Apply theme'}
                  </button>
                ) : (
                  <button
                    className="theme-activate-button is-locked"
                    type="button"
                    onClick={() => setPreviewId(palette.id)}
                    aria-label={`Preview ${palette.name}; theme activation is locked`}
                  >
                    Preview theme <span aria-hidden="true">↗</span>
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {error && <p className="theme-feedback is-error" role="alert">{error}</p>}
      {notice && <p className="theme-feedback is-success" role="status">{notice}</p>}
    </section>
  )
}
