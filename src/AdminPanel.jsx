import { useEffect, useState } from 'react'
import './AdminPanel.css'

const initialContent = {
  welcomeHeading: '',
  welcomeCopy: '',
  focusTitle: '',
  focusCopy: '',
}

const initialSettings = {
  signupsEnabled: true,
  maintenanceMode: false,
}

const activityLabels = {
  account_registration: 'Created an account',
  admin_account_disabled: 'Disabled an account',
  admin_account_enabled: 'Enabled an account',
  admin_content_updated: 'Updated Overview content',
  admin_settings_updated: 'Updated app settings',
  google_login: 'Signed in with Google',
  login: 'Signed in',
  quiz_generation: 'Generated a practice quiz',
  tutor_request: 'Sent a question to the AI tutor',
}

async function readResponse(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Admin request failed (${response.status}).`)
  return data
}

export default function AdminPanel({ csrfToken, onContentSaved, view = 'dashboard' }) {
  const [analytics, setAnalytics] = useState(null)
  const [activities, setActivities] = useState([])
  const [users, setUsers] = useState([])
  const [content, setContent] = useState(initialContent)
  const [settings, setSettings] = useState(initialSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadAdminData() {
      setLoading(true)
      setError('')
      try {
        const [analyticsResponse, usersResponse, contentResponse, settingsResponse] = await Promise.all([
          fetch('/api/admin/analytics'),
          fetch('/api/admin/users'),
          fetch('/api/admin/content'),
          fetch('/api/admin/settings'),
        ])
        const [analyticsData, usersData, contentData, settingsData] = await Promise.all([
          readResponse(analyticsResponse),
          readResponse(usersResponse),
          readResponse(contentResponse),
          readResponse(settingsResponse),
        ])
        if (cancelled) return
        setAnalytics(analyticsData.analytics)
        setUsers(usersData.users)
        setContent(contentData.content)
        setSettings(settingsData.settings)
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Could not load admin data.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadAdminData()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (view !== 'activities') return undefined
    let cancelled = false

    async function loadActivities() {
      try {
        const data = await readResponse(await fetch('/api/admin/activities'))
        if (!cancelled) setActivities(data.activities)
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Could not load recent activities.')
      }
    }

    loadActivities()
    return () => {
      cancelled = true
    }
  }, [view])

  async function saveContent(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const data = await readResponse(await fetch('/api/admin/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify(content),
      }))
      setContent(data.content)
      onContentSaved(data.content)
      setNotice('Overview content saved.')
    } catch (saveError) {
      setError(saveError.message || 'Could not save the overview content.')
    } finally {
      setSaving(false)
    }
  }

  async function updateSettings(nextSettings) {
    setSettings(nextSettings)
    setError('')
    setNotice('')
    try {
      const data = await readResponse(await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify(nextSettings),
      }))
      setSettings(data.settings)
      setNotice('App settings saved.')
    } catch (saveError) {
      setError(saveError.message || 'Could not save app settings.')
      try {
        const data = await readResponse(await fetch('/api/admin/settings'))
        setSettings(data.settings)
      } catch (reloadError) {
        setError(`${saveError.message} ${reloadError.message}`)
      }
    }
  }

  async function toggleUser(user) {
    setError('')
    setNotice('')
    try {
      await readResponse(await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ isActive: !user.isActive }),
      }))
      setUsers(current => current.map(entry =>
        entry.id === user.id ? { ...entry, isActive: !entry.isActive } : entry
      ))
      setNotice(`${user.email} ${user.isActive ? 'disabled' : 'enabled'}.`)
    } catch (updateError) {
      setError(updateError.message || 'Could not update this account.')
    }
  }

  if (loading) {
    return <section className="admin-loading" role="status">Loading admin workspace…</section>
  }

  return (
    <section className="study-subview admin-workspace">
      <div className="study-subview-heading">
        <span className="study-section-kicker">RESTRICTED WORKSPACE</span>
        <h1>{view === 'activities' ? 'Activities' : 'Admin panel'}</h1>
        <p>{view === 'activities' ? 'Recent sign-ins, learning activity, and administrator changes.' : 'Manage StudyAI accounts, usage, and the student experience.'}</p>
      </div>

      {error && <p className="admin-alert is-error" role="alert">{error}</p>}
      {notice && <p className="admin-alert is-success" role="status">{notice}</p>}

      {view === 'activities' ? (
        <section className="admin-section" aria-label="Recent activities">
          <div className="admin-section-heading">
            <div><h2>Recent activity</h2><p>Showing the latest {activities.length} recorded events.</p></div>
            <span className="admin-count">{activities.length} events</span>
          </div>
          <div className="admin-activity-list">
            {activities.map(activity => (
              <article className="admin-activity-row" key={activity.id}>
                <span className="admin-activity-marker" aria-hidden="true" />
                <span className="admin-activity-copy">
                  <strong>{activityLabels[activity.type] || activity.type.replaceAll('_', ' ')}</strong>
                  <small>{activity.displayName} · {activity.email}</small>
                </span>
                <time dateTime={new Date(activity.createdAt).toISOString()}>
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(activity.createdAt)}
                </time>
              </article>
            ))}
            {activities.length === 0 && <p className="admin-empty">No activity has been recorded yet.</p>}
          </div>
        </section>
      ) : (
        <>
      {analytics && (
        <section className="admin-stat-grid" aria-label="Usage analytics">
          <article className="admin-stat-card"><span>Total accounts</span><strong>{analytics.totalUsers}</strong></article>
          <article className="admin-stat-card"><span>Active this week</span><strong>{analytics.activeUsersLast7Days}</strong></article>
          <article className="admin-stat-card"><span>Study chats</span><strong>{analytics.totalChats}</strong></article>
          <article className="admin-stat-card"><span>Messages</span><strong>{analytics.totalMessages}</strong></article>
          <article className="admin-stat-card"><span>New accounts this week</span><strong>{analytics.newUsersLast7Days}</strong></article>
          <article className="admin-stat-card"><span>Tutor requests this week</span><strong>{analytics.activityLast7Days?.tutor_request || 0}</strong></article>
          <article className="admin-stat-card"><span>Quiz generations this week</span><strong>{analytics.activityLast7Days?.quiz_generation || 0}</strong></article>
        </section>
      )}

      <section className="admin-section">
        <div className="admin-section-heading">
          <div><h2>App settings</h2><p>Control account creation and scheduled maintenance.</p></div>
        </div>
        <div className="admin-settings-list">
          <label className="admin-toggle-row">
            <span><strong>Allow new accounts</strong><small>Let students create accounts.</small></span>
            <input
              type="checkbox"
              checked={settings.signupsEnabled}
              onChange={event => updateSettings({ ...settings, signupsEnabled: event.target.checked })}
            />
          </label>
          <label className="admin-toggle-row">
            <span><strong>Maintenance mode</strong><small>Temporarily pause student tutor and quiz requests.</small></span>
            <input
              type="checkbox"
              checked={settings.maintenanceMode}
              onChange={event => updateSettings({ ...settings, maintenanceMode: event.target.checked })}
            />
          </label>
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div><h2>Overview content</h2><p>Edit the welcome and focus-session text shown to students.</p></div>
        </div>
        <form className="admin-content-form" onSubmit={saveContent}>
          <label><span>Welcome heading</span><input maxLength={120} value={content.welcomeHeading} onChange={event => setContent({ ...content, welcomeHeading: event.target.value })} required /></label>
          <label><span>Welcome description</span><input maxLength={240} value={content.welcomeCopy} onChange={event => setContent({ ...content, welcomeCopy: event.target.value })} required /></label>
          <label><span>Focus-session heading</span><input maxLength={120} value={content.focusTitle} onChange={event => setContent({ ...content, focusTitle: event.target.value })} required /></label>
          <label><span>Focus-session description</span><input maxLength={240} value={content.focusCopy} onChange={event => setContent({ ...content, focusCopy: event.target.value })} required /></label>
          <button className="study-primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save overview content'}</button>
        </form>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div><h2>Accounts</h2><p>Disable access for accounts that should not sign in.</p></div>
          <span className="admin-count">{users.length} accounts</span>
        </div>
        <div className="admin-users">
          {users.map(user => (
            <article className="admin-user-row" key={user.id}>
              <span className="admin-user-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span>
              <span className="admin-user-copy">
                <strong>{user.displayName}</strong>
                <small>{user.email} · {user.role}</small>
              </span>
              <span className={`admin-user-status${user.isActive ? ' is-active' : ''}`}>{user.isActive ? 'Active' : 'Disabled'}</span>
              <button
                className="admin-user-action"
                onClick={() => toggleUser(user)}
                disabled={user.role === 'admin' && user.isActive}
                title={user.role === 'admin' && user.isActive ? 'The active administrator cannot be disabled here.' : undefined}
              >
                {user.isActive ? 'Disable' : 'Enable'}
              </button>
            </article>
          ))}
          {users.length === 0 && <p className="admin-empty">No accounts found.</p>}
        </div>
      </section>
        </>
      )}
    </section>
  )
}
