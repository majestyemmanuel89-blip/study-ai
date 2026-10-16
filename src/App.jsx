
import { useEffect, useState } from 'react'
import './App.css'
import FileActionMenu from './FileActionMenu'
import Quiz from './Quiz'
import AuthScreen from './AuthScreen'
import AdminPanel from './AdminPanel'

const CHAT_HISTORY_STORAGE_KEY = 'studyai-chat-history'
const DEFAULT_CONTENT = {
  welcomeHeading: 'Make space for better learning.',
  welcomeCopy: 'Understand the hard things, one focused session at a time.',
  focusTitle: 'Ready for a focused study session?',
  focusCopy: 'Bring a question or a textbook. Your AI study partner is here to help.',
}

const navigation = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'library', label: 'My library', icon: 'book' },
  { id: 'quizzes', label: 'Practice quizzes', icon: 'check' },
]

function isValidChat(chat) {
  return chat
    && typeof chat.id === 'string'
    && typeof chat.title === 'string'
    && typeof chat.updatedAt === 'number'
    && Array.isArray(chat.messages)
    && chat.messages.every(message => message
      && (message.role === 'user' || message.role === 'assistant')
      && typeof message.content === 'string'
    )
}

function loadChatHistory() {
  try {
    const savedHistory = localStorage.getItem(CHAT_HISTORY_STORAGE_KEY)
    if (!savedHistory) return { chats: [], error: '' }

    const parsedHistory = JSON.parse(savedHistory)
    if (!Array.isArray(parsedHistory)) {
      throw new Error('Saved chat history has an unexpected format.')
    }

    const chats = parsedHistory.filter(isValidChat)
    return {
      chats,
      error: chats.length === parsedHistory.length
        ? ''
        : 'Some saved chats could not be loaded.',
    }
  } catch (error) {
    console.error('Unable to load saved chat history:', error)
    return { chats: [], error: 'Chat history could not be loaded from this browser.' }
  }
}

function makeChatTitle(messages) {
  const firstUserMessage = messages.find(message => message.role === 'user')
  const title = firstUserMessage?.content.replace(/\s+/g, ' ').trim()
  if (!title) return 'New chat'
  return title.length > 48 ? `${title.slice(0, 48).trimEnd()}…` : title
}

function mergeChats(firstList, secondList) {
  const chatsById = new Map()
  for (const chat of [...firstList, ...secondList]) {
    const existing = chatsById.get(chat.id)
    if (!existing || chat.updatedAt >= existing.updatedAt) {
      chatsById.set(chat.id, chat)
    }
  }
  return [...chatsById.values()].sort((first, second) => second.updatedAt - first.updatedAt)
}

function getAuthErrorFromUrl() {
  const messages = {
    google_account_disabled: 'This account has been disabled. Contact your administrator.',
    google_cancelled: 'Google sign-in was cancelled.',
    google_email_unverified: 'Google did not provide a verified email address.',
    google_sign_in_failed: 'Google sign-in failed. Please try again.',
    google_signups_disabled: 'New accounts are temporarily unavailable.',
    google_state_invalid: 'Google sign-in expired or could not be verified. Please try again.',
  }
  const url = new URL(window.location.href)
  const error = url.searchParams.get('authError')
  if (!error) return ''
  url.searchParams.delete('authError')
  window.history.replaceState({}, '', url)
  return messages[error] || 'Sign-in could not be completed. Please try again.'
}

function Icon({ name, size = 18 }) {
  const icons = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 5.5v16M8 7h8M8 11h7" /></>,
    check: <><path d="M8 5h12M8 12h12M8 19h12" /><path d="m3 5 1 1 2-2M3 12l1 1 2-2M3 19l1 1 2-2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    plus: <path d="M12 5v14m-7-7h14" />,
    sidebar: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
    sparkle: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  )
}

function App() {
  const [currentView, setCurrentView] = useState('overview')
  const [chatKey, setChatKey] = useState(0)
  const [historyState, setHistoryState] = useState(loadChatHistory)
  const [activeChatId, setActiveChatId] = useState(null)
  const [authState, setAuthState] = useState({ status: 'loading', user: null, csrfToken: null })
  const [authError, setAuthError] = useState(getAuthErrorFromUrl)
  const [googleConfigured, setGoogleConfigured] = useState(false)
  const [content, setContent] = useState(DEFAULT_CONTENT)
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia('(max-width: 650px)').matches)
  const { chats, error: historyError } = historyState
  const date = new Intl.DateTimeFormat('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())
  const currentLabel = currentView.startsWith('admin')
    ? currentView === 'admin-activities' ? 'Activities' : 'Admin panel'
    : navigation.find((item) => item.id === currentView)?.label ?? 'Overview'
  const activeChat = chats.find(chat => chat.id === activeChatId)

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      let sessionData
      try {
        const response = await fetch('/api/auth/me')
        if (!response.ok) throw new Error('Unable to check the sign-in session.')
        sessionData = await response.json()
        if (cancelled) return
        setContent(sessionData.content || DEFAULT_CONTENT)
        setMaintenanceMode(Boolean(sessionData.settings?.maintenanceMode))
        setGoogleConfigured(Boolean(sessionData.googleConfigured))
        if (!sessionData.user) {
          setAuthState({ status: 'anonymous', user: null, csrfToken: null })
          return
        }

        const signedIn = { status: 'signed-in', user: sessionData.user, csrfToken: sessionData.csrfToken }
        setAuthState(signedIn)
        if (sessionData.user.role === 'admin') setCurrentView('admin')
      } catch (error) {
        if (!cancelled) {
          console.error('Unable to restore StudyAI session:', error)
          setAuthError('StudyAI could not connect to the account server. Make sure the backend is running, then refresh.')
          setAuthState({ status: 'anonymous', user: null, csrfToken: null })
        }
        return
      }

      if (cancelled) return
      if (!sessionData.user || !sessionData.csrfToken) return
      try {
        await syncChats(
          { status: 'signed-in', user: sessionData.user, csrfToken: sessionData.csrfToken },
          loadChatHistory().chats,
          () => cancelled,
        )
      } catch (error) {
        if (!cancelled) {
          console.error('Unable to sync restored chat history:', error)
          setHistoryState(current => ({ ...current, error: error.message || 'Chat history could not be synced.' }))
        }
      }
    }

    restoreSession()
    return () => {
      cancelled = true
    }
  }, [])

  async function syncChats(signedIn, localChats, isCancelled = () => false) {
    const remoteResponse = await fetch('/api/chats')
    const remoteData = await remoteResponse.json().catch(() => ({}))
    if (!remoteResponse.ok) throw new Error(remoteData.error || 'Could not load your saved chats.')
    const mergedChats = mergeChats(localChats, remoteData.chats || [])
    const saveResponse = await fetch('/api/chats', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': signedIn.csrfToken,
      },
      body: JSON.stringify({ chats: mergedChats }),
    })
    const saveData = await saveResponse.json().catch(() => ({}))
    if (!saveResponse.ok) throw new Error(saveData.error || 'Could not sync your saved chats.')
    const syncedChats = saveData.chats || mergedChats
    if (!isCancelled()) {
      setHistoryState({ chats: syncedChats, error: '' })
      try {
        localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(syncedChats))
      } catch (error) {
        console.error('Unable to cache synced chat history locally:', error)
      }
    }
  }

  async function handleAuthenticated(data) {
    if (!data.user || !data.csrfToken) {
      setAuthError('The account server returned an invalid sign-in response.')
      return
    }
    const signedIn = { status: 'signed-in', user: data.user, csrfToken: data.csrfToken }
    setAuthState(signedIn)
    setAuthError('')
    setCurrentView(data.user.role === 'admin' ? 'admin' : 'overview')
    try {
      await syncChats(signedIn, loadChatHistory().chats)
    } catch (error) {
      console.error('Unable to sync account chat history:', error)
      setHistoryState(current => ({ ...current, error: error.message || 'Chat history could not be synced.' }))
    }
  }

  async function logout() {
    setAuthError('')
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': authState.csrfToken },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || `Sign out failed (${response.status}).`)
      try {
        localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY)
      } catch (error) {
        console.error('Unable to clear the local chat cache:', error)
      }
      setHistoryState({ chats: [], error: '' })
      setAuthState({ status: 'anonymous', user: null, csrfToken: null })
      setActiveChatId(null)
      setChatKey(key => key + 1)
      setCurrentView('overview')
    } catch (error) {
      setAuthError(error.message || 'Could not sign out. Please try again.')
    }
  }

  async function saveConversation(messages) {
    if (!messages.length) return

    const chatId = activeChatId || (
      globalThis.crypto?.randomUUID?.()
      ?? `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    const updatedAt = Date.now()
    const existingChat = chats.find(chat => chat.id === chatId)
    const nextChat = {
      id: chatId,
      title: existingChat?.title || makeChatTitle(messages),
      updatedAt,
      messages,
    }
    const updatedChats = [
      nextChat,
      ...chats.filter(chat => chat.id !== chatId),
    ].sort((first, second) => second.updatedAt - first.updatedAt)
    setActiveChatId(chatId)
    try {
      localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(updatedChats))
    } catch (error) {
      console.error('Unable to save chat history:', error)
    }
    setHistoryState({ chats: updatedChats, error: '' })
    if (authState.status === 'signed-in') {
      try {
        const response = await fetch('/api/chats', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': authState.csrfToken,
          },
          body: JSON.stringify({ chats: updatedChats }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || `Chat sync failed (${response.status}).`)
        setHistoryState({ chats: data.chats || updatedChats, error: '' })
      } catch (error) {
        console.error('Unable to sync chat history:', error)
        setHistoryState({ chats: updatedChats, error: error.message || 'Chat history could not be synced.' })
      }
    }
  }

  function navigateTo(view) {
    setCurrentView(view)
    if (window.matchMedia('(max-width: 650px)').matches) setSidebarOpen(false)
  }

  function startNewChat() {
    navigateTo('overview')
    setActiveChatId(null)
    setChatKey(key => key + 1)
  }

  function openChat(chat) {
    setActiveChatId(chat.id)
    navigateTo('overview')
  }

  const studyMenu = (
    <FileActionMenu
      key={`${chatKey}-${activeChatId || 'new'}`}
      documents={[]}
      csrfToken={authState.csrfToken}
      initialMessages={activeChat?.messages || []}
      onMessagesChange={saveConversation}
      onFilesSelected={(files) => {
        console.log('Selected documents:', files)
      }}
      onSelectDocument={(document) => {
        console.log('Selected library document:', document)
      }}
    />
  )

  if (authState.status === 'loading') {
    return <main className="auth-shell"><p role="status">Checking your StudyAI account…</p></main>
  }
  if (authState.status !== 'signed-in') {
    return (
      <AuthScreen
        onAuthenticated={handleAuthenticated}
        googleConfigured={googleConfigured}
        initialError={authError}
      />
    )
  }

  return (
    <div className={`study-shell${sidebarOpen ? ' is-sidebar-open' : ''}`}>
      {sidebarOpen && (
        <button
          className="study-sidebar-backdrop"
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className="study-sidebar" id="study-navigation">
        <button
          className="study-brand"
          onClick={() => navigateTo('overview')}
          aria-label="StudyAI dashboard"
        >
          <span className="study-brand-mark"><Icon name="sparkle" size={20} /></span>
          <span>Study<span className="study-brand-accent">AI</span></span>
        </button>

        <button
          className="study-new-session"
          onClick={startNewChat}
        >
          <Icon name="plus" size={17} />
          <span>New chat</span>
        </button>

        <nav className="study-nav" aria-label="Main navigation">
          <p className="study-nav-label">WORKSPACE</p>
          {navigation.map((item) => (
            <button
              className={`study-nav-link${item.id === currentView ? ' is-active' : ''}`}
              onClick={() => navigateTo(item.id)}
              key={item.label}
              aria-current={item.id === currentView ? 'page' : undefined}
            >
              <Icon name={item.icon} size={17} />
              <span>{item.label}</span>
            </button>
          ))}
          {authState.user?.role === 'admin' && (
            <>
              <p className="study-nav-label study-nav-section-label">ADMINISTRATION</p>
              <button
                className={`study-nav-link${currentView === 'admin' ? ' is-active' : ''}`}
                onClick={() => setCurrentView('admin')}
                aria-current={currentView === 'admin' ? 'page' : undefined}
              >
                <Icon name="grid" size={17} />
                <span>Admin panel</span>
              </button>
              <button
                className={`study-nav-link${currentView === 'admin-activities' ? ' is-active' : ''}`}
                onClick={() => setCurrentView('admin-activities')}
                aria-current={currentView === 'admin-activities' ? 'page' : undefined}
              >
                <Icon name="clock" size={17} />
                <span>Activities</span>
              </button>
            </>
          )}
        </nav>

        <div className="study-recent-sidebar">
          <p className="study-nav-label">CHAT HISTORY</p>
          {historyError && <p className="study-history-error" role="status">{historyError}</p>}
          {chats.length > 0 ? (
            <div className="study-chat-history-list" aria-label="Chat history">
              {chats.map(chat => (
                <button
                  className={`study-chat-history-item${chat.id === activeChatId ? ' is-active' : ''}`}
                  key={chat.id}
                  onClick={() => openChat(chat)}
                  title={chat.title}
                  aria-current={chat.id === activeChatId ? 'page' : undefined}
                >
                  <Icon name="sparkle" size={14} />
                  <span>{chat.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="study-recent-empty">
              <span><Icon name="sparkle" size={15} /></span>
              <p><strong>No chats yet</strong><small>Your conversations will appear here.</small></p>
            </div>
          )}
        </div>

        <div className="study-account">
          <span className="study-avatar">{authState.user.displayName.slice(0, 1).toUpperCase()}</span>
          <span className="study-account-copy">
            <strong>{authState.user.displayName}</strong>
            <small>{authState.user.role === 'admin' ? 'Administrator' : authState.user.email}</small>
          </span>
          <button className="study-account-signout" onClick={logout}>Sign out</button>
        </div>
      </aside>

      <main className="study-main" id="dashboard">
        <header className="study-topbar">
          <div className="study-topbar-left">
            <button
              className="study-sidebar-toggle"
              type="button"
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              aria-controls="study-navigation"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(open => !open)}
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              <Icon name="sidebar" size={19} />
            </button>
            <div className="study-breadcrumb"><span>Workspace</span><span>/</span><strong>{currentLabel}</strong></div>
          </div>
          <div className="study-topbar-right">
            <span className="study-date">{date}</span>
            <span className="study-top-avatar" aria-label={`${authState.user.displayName} account`}>
              {authState.user.displayName.slice(0, 1).toUpperCase()}
            </span>
            <button className="study-mobile-signout" onClick={logout}>Sign out</button>
          </div>
        </header>

        <div className={`study-content${currentView === 'overview' ? ' is-overview' : ''}`}>
          {authError && <p className="study-session-alert" role="alert">{authError}</p>}
          {maintenanceMode && authState.user.role !== 'admin' && (
            <p className="study-maintenance-alert" role="status">StudyAI is in maintenance mode. Tutor and quiz requests are temporarily unavailable.</p>
          )}
          {currentView === 'overview' && (
            <>
              <div className="study-overview-focus">
                <section className="study-welcome">
                  <div>
                    <p className="study-overline">YOUR PERSONAL STUDY SPACE</p>
                    <h1>{content.welcomeHeading}</h1>
                    <p className="study-welcome-copy">
                      {content.welcomeCopy}
                    </p>
                  </div>
                  <div className="study-welcome-mark" aria-hidden="true">
                    <span className="study-orbit study-orbit-one" />
                    <span className="study-orbit study-orbit-two" />
                    <span className="study-orbit study-orbit-three" />
                    <span className="study-orbit-center"><Icon name="sparkle" size={28} /></span>
                  </div>
                </section>

                <section className="study-focus-banner">
                  <div className="study-focus-symbol"><Icon name="target" size={22} /></div>
                  <div className="study-focus-copy">
                    <span className="study-focus-label">A GOOD PLACE TO START</span>
                    <h2>{content.focusTitle}</h2>
                    <p>{content.focusCopy}</p>
                    <div className="study-focus-tags">
                      <span><Icon name="clock" size={14} /> Go at your own pace</span>
                      <span><Icon name="sparkle" size={14} /> Ask anything</span>
                    </div>
                  </div>
                  <button className="study-primary-button" onClick={() => setCurrentView('overview')}>
                    Start studying <Icon name="arrow" size={16} />
                  </button>
                  <div className="study-banner-glow" aria-hidden="true" />
                </section>
              </div>
              <div className="study-bottom-composer">
                <div className="study-composer">{studyMenu}</div>
                <p>StudyAI can make mistakes. Check important information.</p>
              </div>
            </>
          )}

          {currentView === 'library' && (
            <section className="study-subview study-library-view">
              <div className="study-subview-heading">
                <span className="study-section-kicker">YOUR STUDY MATERIALS</span>
                <h1>My library</h1>
              </div>
              <div className="study-library-composer study-composer">{studyMenu}</div>
            </section>
          )}

          {currentView === 'quizzes' && (
            <section className="study-subview study-quiz-view">
              <div className="study-subview-heading">
                <span className="study-section-kicker">PRACTICE & REVIEW</span>
                <h1>Practice quizzes</h1>
                <p>Test your understanding with a personalized quiz on any topic.</p>
              </div>
              <Quiz csrfToken={authState.csrfToken} />
            </section>
          )}

          {(currentView === 'admin' || currentView === 'admin-activities') && authState.user.role === 'admin' && (
            <AdminPanel
              csrfToken={authState.csrfToken}
              onContentSaved={setContent}
              view={currentView === 'admin-activities' ? 'activities' : 'dashboard'}
            />
          )}

          {currentView !== 'overview' && (
            <footer className="study-footer"><span>StudyAI</span><span>Built for curious minds.</span></footer>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
