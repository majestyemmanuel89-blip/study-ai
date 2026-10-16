import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const SESSION_COOKIE = 'studyai_session'
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000
const AUTH_ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const AUTH_COOLDOWN_MS = 15 * 1000
const MAX_AUTH_ATTEMPTS = 10
const PASSWORD_MIN_LENGTH = 10
const PASSWORD_MAX_LENGTH = 128
const ADMIN_PASSWORD_MIN_LENGTH = 5
const ADMIN_PASSWORD_MAX_LENGTH = 10
const DEFAULT_CONTENT = {
  welcomeHeading: 'Make space for better learning.',
  welcomeCopy: 'Understand the hard things, one focused session at a time.',
  focusTitle: 'Ready for a focused study session?',
  focusCopy: 'Bring a question or a textbook. Your AI study partner is here to help.',
}
const DEFAULT_SETTINGS = {
  signupsEnabled: true,
  maintenanceMode: false,
}

function normalizeEmail(email) {
  return email.trim().toLowerCase()
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function readRequestCookie(req, name) {
  const prefix = `${name}=`
  return (req.headers.cookie || '')
    .split(';')
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(prefix))
    ?.slice(prefix.length)
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return {
    salt,
    hash: scryptSync(password, salt, 64).toString('hex'),
  }
}

function verifyPassword(password, salt, expectedHash) {
  const actualHash = scryptSync(password, salt, 64)
  const expected = Buffer.from(expectedHash, 'hex')
  return actualHash.length === expected.length && timingSafeEqual(actualHash, expected)
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function safeUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
  }
}

function parseChat(chat) {
  if (
    !chat
    || typeof chat.id !== 'string'
    || chat.id.length < 1
    || chat.id.length > 80
    || typeof chat.title !== 'string'
    || !chat.title.trim()
    || chat.title.length > 120
    || typeof chat.updatedAt !== 'number'
    || !Number.isFinite(chat.updatedAt)
    || !Array.isArray(chat.messages)
    || chat.messages.length > 100
  ) {
    return null
  }

  const messages = []
  for (const message of chat.messages) {
    if (
      !message
      || !['user', 'assistant'].includes(message.role)
      || typeof message.content !== 'string'
      || message.content.length > 60000
      || (message.files !== undefined
        && (!Array.isArray(message.files)
          || message.files.length > 20
          || !message.files.every(file => typeof file === 'string' && file.length <= 255)))
    ) {
      return null
    }
    messages.push({
      role: message.role,
      content: message.content,
      ...(message.files ? { files: message.files } : {}),
    })
  }

  return {
    id: chat.id,
    title: chat.title.trim(),
    updatedAt: Math.floor(chat.updatedAt),
    messages,
  }
}

export function createAuthStore(databasePath = process.env.DATABASE_PATH || path.resolve('data', 'studyai.sqlite')) {
  mkdirSync(path.dirname(databasePath), { recursive: true })
  const database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at INTEGER NOT NULL,
      last_login_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS chats (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      messages_json TEXT NOT NULL,
      PRIMARY KEY (user_id, id)
    );
    CREATE INDEX IF NOT EXISTS chats_updated_idx ON chats(user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS usage_events_created_idx ON usage_events(created_at);
    CREATE TABLE IF NOT EXISTS app_values (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  const queries = {
    userByEmail: database.prepare('SELECT * FROM users WHERE email = ?'),
    userById: database.prepare('SELECT * FROM users WHERE id = ?'),
    insertUser: database.prepare(`
      INSERT INTO users (id, email, display_name, password_salt, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    updateUserPassword: database.prepare(`
      UPDATE users SET password_salt = ?, password_hash = ?, role = 'admin', is_active = 1
      WHERE id = ?
    `),
    insertSession: database.prepare(`
      INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)
    `),
    session: database.prepare(`
      SELECT sessions.csrf_token, sessions.expires_at, users.*
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ?
    `),
    deleteSession: database.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    deleteUserSessions: database.prepare('DELETE FROM sessions WHERE user_id = ?'),
    deleteExpiredSessions: database.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    updateLogin: database.prepare('UPDATE users SET last_login_at = ? WHERE id = ?'),
    addEvent: database.prepare('INSERT INTO usage_events (user_id, event_type, created_at) VALUES (?, ?, ?)'),
    getValue: database.prepare('SELECT value_json FROM app_values WHERE key = ?'),
    setValue: database.prepare(`
      INSERT INTO app_values (key, value_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `),
    listChats: database.prepare(`
      SELECT id, title, updated_at, messages_json FROM chats WHERE user_id = ? ORDER BY updated_at DESC
    `),
    upsertChat: database.prepare(`
      INSERT INTO chats (user_id, id, title, updated_at, messages_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, id) DO UPDATE SET
        title = excluded.title,
        updated_at = excluded.updated_at,
        messages_json = excluded.messages_json
    `),
    userCount: database.prepare('SELECT COUNT(*) AS count FROM users'),
    activeUsers: database.prepare('SELECT COUNT(*) AS count FROM users WHERE last_login_at >= ?'),
    chatCount: database.prepare('SELECT COUNT(*) AS count FROM chats'),
    messageCount: database.prepare('SELECT COUNT(*) AS count FROM chats, json_each(chats.messages_json)'),
    newUsers: database.prepare('SELECT COUNT(*) AS count FROM users WHERE created_at >= ?'),
    usageCounts: database.prepare(`
      SELECT event_type, COUNT(*) AS count FROM usage_events
      WHERE created_at >= ? GROUP BY event_type
    `),
    recentActivity: database.prepare(`
      SELECT usage_events.id, usage_events.event_type, usage_events.created_at,
        users.display_name, users.email
      FROM usage_events
      JOIN users ON users.id = usage_events.user_id
      ORDER BY usage_events.created_at DESC, usage_events.id DESC
      LIMIT 100
    `),
    listUsers: database.prepare(`
      SELECT id, email, display_name, role, is_active, created_at, last_login_at
      FROM users ORDER BY created_at DESC
    `),
    updateUserActive: database.prepare('UPDATE users SET is_active = ? WHERE id = ?'),
  }

  for (const [key, value] of Object.entries(DEFAULT_CONTENT)) {
    if (!queries.getValue.get(`content.${key}`)) {
      queries.setValue.run(`content.${key}`, JSON.stringify(value), Date.now())
    }
  }
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!queries.getValue.get(`setting.${key}`)) {
      queries.setValue.run(`setting.${key}`, JSON.stringify(value), Date.now())
    }
  }

  const adminEmail = process.env.ADMIN_EMAIL ? normalizeEmail(process.env.ADMIN_EMAIL) : ''
  const adminPassword = process.env.ADMIN_PASSWORD
  if (adminEmail || adminPassword) {
    if (!adminEmail || !adminPassword) {
      throw new Error('Set both ADMIN_EMAIL and ADMIN_PASSWORD to configure the initial administrator.')
    }
    if (
      !isValidEmail(adminEmail)
      || adminPassword.length < ADMIN_PASSWORD_MIN_LENGTH
      || adminPassword.length > ADMIN_PASSWORD_MAX_LENGTH
    ) {
      throw new Error(
        `ADMIN_EMAIL must be valid and ADMIN_PASSWORD must be ${ADMIN_PASSWORD_MIN_LENGTH}-${ADMIN_PASSWORD_MAX_LENGTH} characters.`,
      )
    }

    const password = hashPassword(adminPassword)
    const existingAdmin = queries.userByEmail.get(adminEmail)
    if (existingAdmin) {
      queries.deleteUserSessions.run(existingAdmin.id)
      queries.updateUserPassword.run(password.salt, password.hash, existingAdmin.id)
    } else {
      queries.insertUser.run(
        randomUUID(),
        adminEmail,
        'StudyAI Administrator',
        password.salt,
        password.hash,
        'admin',
        Date.now(),
      )
    }
  } else {
    console.warn('No admin account configured. Set ADMIN_EMAIL and ADMIN_PASSWORD to enable admin access.')
  }

  const getStoredValue = (key, fallback) => {
    const result = queries.getValue.get(key)
    return result ? JSON.parse(result.value_json) : fallback
  }

  return {
    database,
    createUser({ email, displayName, password, role = 'student' }) {
      const credentials = hashPassword(password)
      const id = randomUUID()
      queries.insertUser.run(
        id,
        email,
        displayName,
        credentials.salt,
        credentials.hash,
        role,
        Date.now(),
      )
      return queries.userById.get(id)
    },
    findUserByEmail(email) {
      return queries.userByEmail.get(email)
    },
    verifyPassword,
    createSession(userId) {
      queries.deleteExpiredSessions.run(Date.now())
      const token = randomBytes(32).toString('hex')
      const csrfToken = randomBytes(32).toString('hex')
      const expiresAt = Date.now() + SESSION_LIFETIME_MS
      queries.insertSession.run(hashToken(token), userId, csrfToken, expiresAt)
      return { token, csrfToken, expiresAt }
    },
    getSession(token) {
      if (!token || token.length !== 64 || !/^[a-f0-9]+$/i.test(token)) return null
      const session = queries.session.get(hashToken(token))
      if (!session || session.expires_at <= Date.now() || !session.is_active) return null
      return { user: safeUser(session), csrfToken: session.csrf_token }
    },
    deleteSession(token) {
      if (token) queries.deleteSession.run(hashToken(token))
    },
    updateLastLogin(userId) {
      queries.updateLogin.run(Date.now(), userId)
    },
    recordUsage(userId, eventType) {
      queries.addEvent.run(userId, eventType, Date.now())
    },
    getRecentActivity() {
      return queries.recentActivity.all().map(event => ({
        id: event.id,
        type: event.event_type,
        createdAt: event.created_at,
        displayName: event.display_name,
        email: event.email,
      }))
    },
    getChats(userId) {
      return queries.listChats.all(userId).map(chat => ({
        id: chat.id,
        title: chat.title,
        updatedAt: chat.updated_at,
        messages: JSON.parse(chat.messages_json),
      }))
    },
    saveChats(userId, chatList) {
      if (!Array.isArray(chatList) || chatList.length > 100) {
        return { error: 'Send no more than 100 chats at a time.' }
      }
      const chats = chatList.map(parseChat)
      if (chats.some(chat => !chat)) {
        return { error: 'One or more chats are invalid.' }
      }

      const saveTransaction = database.prepare('SAVEPOINT save_chats')
      saveTransaction.run()
      try {
        for (const chat of chats) {
          queries.upsertChat.run(userId, chat.id, chat.title, chat.updatedAt, JSON.stringify(chat.messages))
        }
        database.exec('RELEASE SAVEPOINT save_chats')
      } catch (error) {
        database.exec('ROLLBACK TO SAVEPOINT save_chats')
        database.exec('RELEASE SAVEPOINT save_chats')
        throw error
      }
      return { chats: this.getChats(userId) }
    },
    getContent() {
      return Object.fromEntries(
        Object.keys(DEFAULT_CONTENT).map(key => [`${key}`, getStoredValue(`content.${key}`, DEFAULT_CONTENT[key])]),
      )
    },
    setContent(values) {
      const nextContent = {}
      for (const [key, maxLength] of Object.entries({
        welcomeHeading: 120,
        welcomeCopy: 240,
        focusTitle: 120,
        focusCopy: 240,
      })) {
        const value = values[key]
        if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
          return { error: `Enter ${key} with no more than ${maxLength} characters.` }
        }
        nextContent[key] = value.trim()
      }
      for (const [key, value] of Object.entries(nextContent)) {
        queries.setValue.run(`content.${key}`, JSON.stringify(value), Date.now())
      }
      return { content: nextContent }
    },
    getSettings() {
      return Object.fromEntries(
        Object.keys(DEFAULT_SETTINGS).map(key => [key, getStoredValue(`setting.${key}`, DEFAULT_SETTINGS[key])]),
      )
    },
    setSettings(values) {
      const settings = this.getSettings()
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (typeof values[key] !== 'boolean') {
          return { error: `Setting "${key}" must be true or false.` }
        }
        settings[key] = values[key]
      }
      for (const [key, value] of Object.entries(settings)) {
        queries.setValue.run(`setting.${key}`, JSON.stringify(value), Date.now())
      }
      return { settings }
    },
    getUsers() {
      return queries.listUsers.all().map(user => ({
        ...safeUser(user),
        isActive: Boolean(user.is_active),
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
      }))
    },
    setUserActive(userId, isActive) {
      const result = queries.updateUserActive.run(isActive ? 1 : 0, userId)
      return result.changes > 0
    },
    getAnalytics() {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      return {
        totalUsers: queries.userCount.get().count,
        activeUsersLast7Days: queries.activeUsers.get(weekAgo).count,
        totalChats: queries.chatCount.get().count,
        totalMessages: queries.messageCount.get().count,
        newUsersLast7Days: queries.newUsers.get(weekAgo).count,
        activityLast7Days: Object.fromEntries(
          queries.usageCounts.all(weekAgo).map(row => [row.event_type, row.count]),
        ),
      }
    },
  }
}

export function attachAuth(app, store) {
  const registrationAttempts = new Map()
  const loginFailures = new Map()
  const cookieSecure = process.env.NODE_ENV === 'production'
  const oauthStateCookie = 'studyai_google_state'
  const getGoogleConfig = () => ({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  })
  const googleConfigured = () => {
    const { clientId, clientSecret, redirectUri } = getGoogleConfig()
    if (!clientId || !clientSecret || !redirectUri) return false
    try {
      const callback = new URL(redirectUri)
      return ['http:', 'https:'].includes(callback.protocol)
        && callback.pathname === '/api/auth/google/callback'
        && !callback.username
        && !callback.password
        && !callback.search
        && !callback.hash
        && (process.env.NODE_ENV !== 'production' || callback.protocol === 'https:')
    } catch {
      return false
    }
  }

  app.use((req, _res, next) => {
    req.sessionToken = readRequestCookie(req, SESSION_COOKIE)
    req.authSession = store.getSession(req.sessionToken)
    req.authUser = req.authSession?.user || null
    next()
  })

  const sendSessionCookie = (res, token, maxAge) => {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: 'strict',
      path: '/',
      maxAge,
    })
  }

  const clearOAuthStateCookie = res => {
    res.clearCookie(oauthStateCookie, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: 'lax',
      path: '/',
    })
  }

  const googleErrorRedirect = (res, redirectUri, error) => {
    const destination = new URL('/', redirectUri)
    destination.searchParams.set('authError', error)
    res.redirect(destination.toString())
  }

  const checkOrigin = (req, res, next) => {
    const origin = req.get('origin')
    if (origin) {
      try {
        const forwardedHost = req.get('x-forwarded-host')?.split(',')[0].trim()
        const requestHost = forwardedHost || req.get('host')
        if (new URL(origin).host.toLowerCase() !== requestHost?.toLowerCase()) {
          return res.status(403).json({ error: 'This request origin is not allowed.' })
        }
      } catch {
        return res.status(403).json({ error: 'This request origin is not allowed.' })
      }
    }
    next()
  }

  const requireUser = (req, res, next) => {
    if (!req.authUser) return res.status(401).json({ error: 'Sign in to continue.' })
    next()
  }

  const requireCsrf = (req, res, next) => {
    const supplied = req.get('x-csrf-token')
    const expected = req.authSession?.csrfToken
    if (
      !expected
      || !supplied
      || Buffer.byteLength(supplied) !== Buffer.byteLength(expected)
      || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      return res.status(403).json({ error: 'Your session security token is missing or expired. Refresh and try again.' })
    }
    next()
  }

  const requireAdmin = (req, res, next) => {
    if (!req.authUser || req.authUser.role !== 'admin') {
      return res.status(404).json({ error: 'Not found.' })
    }
    next()
  }

  const allowRegistrationAttempt = (req, res, next) => {
    const now = Date.now()
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    const recentAttempts = (registrationAttempts.get(ip) || [])
      .filter(timestamp => now - timestamp < AUTH_ATTEMPT_WINDOW_MS)
    if (recentAttempts.length >= MAX_AUTH_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes before trying again.' })
    }
    recentAttempts.push(now)
    registrationAttempts.set(ip, recentAttempts)
    next()
  }

  const allowLoginAttempt = (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    const attempt = loginFailures.get(ip)
    const now = Date.now()
    if (attempt?.lockedUntil > now) {
      const secondsRemaining = Math.ceil((attempt.lockedUntil - now) / 1000)
      return res.status(429).json({ error: `Too many failed sign-in attempts. Wait ${secondsRemaining} seconds before trying again.` })
    }
    if (attempt?.lockedUntil) loginFailures.delete(ip)
    next()
  }

  const recordLoginFailure = req => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    const now = Date.now()
    const recentFailures = (loginFailures.get(ip)?.timestamps || [])
      .filter(timestamp => now - timestamp < AUTH_ATTEMPT_WINDOW_MS)
    recentFailures.push(now)
    loginFailures.set(ip, {
      timestamps: recentFailures,
      lockedUntil: recentFailures.length >= MAX_AUTH_ATTEMPTS ? now + AUTH_COOLDOWN_MS : 0,
    })
  }

  const clearLoginFailures = req => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    loginFailures.delete(ip)
  }

  app.use(['/api/tutor', '/api/quiz'], checkOrigin, requireUser, requireCsrf, (req, res, next) => {
    if (store.getSettings().maintenanceMode && req.authUser.role !== 'admin') {
      return res.status(503).json({ error: 'StudyAI is temporarily unavailable for maintenance.' })
    }
    next()
  })

  app.get('/api/auth/me', (req, res) => {
    res.json({
      user: req.authUser,
      csrfToken: req.authSession?.csrfToken || null,
      googleConfigured: googleConfigured(),
      content: store.getContent(),
      settings: store.getSettings(),
    })
  })

  app.get('/api/auth/google', (_req, res) => {
    if (!googleConfigured()) {
      return res.status(503).json({ error: 'Google sign-in is not configured on this server.' })
    }
    const { clientId, redirectUri } = getGoogleConfig()
    const state = randomBytes(32).toString('hex')
    res.cookie(oauthStateCookie, state, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60 * 1000,
    })
    const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authorizationUrl.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    }).toString()
    res.redirect(authorizationUrl.toString())
  })

  app.get('/api/auth/google/callback', async (req, res) => {
    const { clientId, clientSecret, redirectUri } = getGoogleConfig()
    if (!clientId || !clientSecret || !redirectUri) {
      return res.status(503).send('Google sign-in is not configured on this server.')
    }
    const stateCookie = readRequestCookie(req, oauthStateCookie)
    const stateQuery = typeof req.query.state === 'string' ? req.query.state : ''
    clearOAuthStateCookie(res)
    if (
      !stateCookie
      || !stateQuery
      || stateCookie.length !== stateQuery.length
      || !timingSafeEqual(Buffer.from(stateCookie), Buffer.from(stateQuery))
    ) {
      return googleErrorRedirect(res, redirectUri, 'google_state_invalid')
    }
    if (req.query.error === 'access_denied') {
      return googleErrorRedirect(res, redirectUri, 'google_cancelled')
    }
    if (typeof req.query.code !== 'string' || !req.query.code) {
      return googleErrorRedirect(res, redirectUri, 'google_sign_in_failed')
    }

    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: req.query.code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      })
      if (!tokenResponse.ok) {
        console.error(`Google OAuth token exchange failed with status ${tokenResponse.status}.`)
        return googleErrorRedirect(res, redirectUri, 'google_sign_in_failed')
      }
      const tokens = await tokenResponse.json()
      if (typeof tokens.access_token !== 'string' || !tokens.access_token) {
        console.error('Google OAuth token response did not include an access token.')
        return googleErrorRedirect(res, redirectUri, 'google_sign_in_failed')
      }

      const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (!profileResponse.ok) {
        console.error(`Google user profile request failed with status ${profileResponse.status}.`)
        return googleErrorRedirect(res, redirectUri, 'google_sign_in_failed')
      }
      const profile = await profileResponse.json()
      if (
        typeof profile.sub !== 'string'
        || typeof profile.email !== 'string'
        || profile.email_verified !== true
      ) {
        console.error('Google user profile is missing a verified email or subject identifier.')
        return googleErrorRedirect(res, redirectUri, 'google_email_unverified')
      }

      const email = normalizeEmail(profile.email)
      if (!isValidEmail(email)) {
        return googleErrorRedirect(res, redirectUri, 'google_email_unverified')
      }
      let user = store.findUserByEmail(email)
      if (!user) {
        if (!store.getSettings().signupsEnabled) {
          return googleErrorRedirect(res, redirectUri, 'google_signups_disabled')
        }
        const displayName = typeof profile.name === 'string' && profile.name.trim()
          ? profile.name.trim().slice(0, 60)
          : email.split('@')[0]
        user = store.createUser({
          email,
          displayName,
          password: randomBytes(32).toString('hex'),
        })
        store.recordUsage(user.id, 'account_registration')
      }
      if (!user.is_active) {
        return googleErrorRedirect(res, redirectUri, 'google_account_disabled')
      }

      const session = store.createSession(user.id)
      store.updateLastLogin(user.id)
      store.recordUsage(user.id, 'google_login')
      sendSessionCookie(res, session.token, SESSION_LIFETIME_MS)
      res.redirect(new URL('/', redirectUri).toString())
    } catch (error) {
      console.error('Google sign-in failed:', error)
      googleErrorRedirect(res, redirectUri, 'google_sign_in_failed')
    }
  })

  app.post('/api/auth/register', checkOrigin, allowRegistrationAttempt, (req, res) => {
    if (!store.getSettings().signupsEnabled) {
      return res.status(403).json({ error: 'New accounts are temporarily unavailable.' })
    }
    const { email, password, displayName = '' } = req.body ?? {}
    if (typeof email !== 'string' || typeof password !== 'string' || typeof displayName !== 'string') {
      return res.status(400).json({ error: 'Enter a valid email address and password.' })
    }
    const normalizedEmail = normalizeEmail(email)
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Enter a valid email address.' })
    }
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      return res.status(400).json({ error: `Your password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters.` })
    }
    if (displayName.trim().length > 60) {
      return res.status(400).json({ error: 'Your name must be 60 characters or fewer.' })
    }
    if (store.findUserByEmail(normalizedEmail)) {
      return res.status(409).json({ error: 'An account with that email already exists.' })
    }

    const user = store.createUser({
      email: normalizedEmail,
      displayName: displayName.trim() || normalizedEmail.split('@')[0],
      password,
    })
    store.recordUsage(user.id, 'account_registration')
    const session = store.createSession(user.id)
    store.updateLastLogin(user.id)
    sendSessionCookie(res, session.token, SESSION_LIFETIME_MS)
    res.status(201).json({ user: safeUser(user), csrfToken: session.csrfToken })
  })

  app.post('/api/auth/login', checkOrigin, allowLoginAttempt, (req, res) => {
    const { email, password } = req.body ?? {}
    if (typeof email !== 'string' || typeof password !== 'string' || password.length > PASSWORD_MAX_LENGTH) {
      return res.status(400).json({ error: 'Enter your email and password.' })
    }
    const user = store.findUserByEmail(normalizeEmail(email))
    const valid = user
      && user.is_active
      && store.verifyPassword(password, user.password_salt, user.password_hash)
    if (!valid) {
      recordLoginFailure(req)
      return res.status(401).json({ error: 'Email or password is incorrect.' })
    }

    clearLoginFailures(req)
    const session = store.createSession(user.id)
    store.updateLastLogin(user.id)
    store.recordUsage(user.id, 'login')
    sendSessionCookie(res, session.token, SESSION_LIFETIME_MS)
    res.json({ user: safeUser(user), csrfToken: session.csrfToken })
  })

  app.post('/api/auth/logout', checkOrigin, requireUser, requireCsrf, (req, res) => {
    store.deleteSession(req.sessionToken)
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: 'strict',
      path: '/',
    })
    res.status(204).end()
  })

  app.get('/api/content', (_req, res) => res.json({ content: store.getContent() }))

  app.get('/api/chats', requireUser, (req, res) => {
    res.json({ chats: store.getChats(req.authUser.id) })
  })

  app.put('/api/chats', checkOrigin, requireUser, requireCsrf, (req, res) => {
    const result = store.saveChats(req.authUser.id, req.body?.chats)
    if (result.error) return res.status(400).json({ error: result.error })
    res.json({ chats: result.chats })
  })

  app.get('/api/admin/users', requireAdmin, (_req, res) => {
    res.json({ users: store.getUsers() })
  })

  app.patch('/api/admin/users/:id', checkOrigin, requireAdmin, requireCsrf, (req, res) => {
    const { isActive } = req.body ?? {}
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'Choose whether the account should be active.' })
    }
    if (req.params.id === req.authUser.id && !isActive) {
      return res.status(400).json({ error: 'You cannot disable the administrator account you are using.' })
    }
    if (!store.setUserActive(req.params.id, isActive)) {
      return res.status(404).json({ error: 'Account not found.' })
    }
    store.recordUsage(req.authUser.id, isActive ? 'admin_account_enabled' : 'admin_account_disabled')
    res.json({ success: true })
  })

  app.get('/api/admin/activities', requireAdmin, (_req, res) => {
    res.json({ activities: store.getRecentActivity() })
  })

  app.get('/api/admin/analytics', requireAdmin, (_req, res) => {
    res.json({ analytics: store.getAnalytics() })
  })

  app.get('/api/admin/content', requireAdmin, (_req, res) => {
    res.json({ content: store.getContent() })
  })

  app.put('/api/admin/content', checkOrigin, requireAdmin, requireCsrf, (req, res) => {
    const result = store.setContent(req.body ?? {})
    if (result.error) return res.status(400).json({ error: result.error })
    store.recordUsage(req.authUser.id, 'admin_content_updated')
    res.json(result)
  })

  app.get('/api/admin/settings', requireAdmin, (_req, res) => {
    res.json({ settings: store.getSettings() })
  })

  app.put('/api/admin/settings', checkOrigin, requireAdmin, requireCsrf, (req, res) => {
    const result = store.setSettings(req.body ?? {})
    if (result.error) return res.status(400).json({ error: result.error })
    store.recordUsage(req.authUser.id, 'admin_settings_updated')
    res.json(result)
  })

  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/')) return next()
    if (!req.authUser) return res.status(401).json({ error: 'Sign in to continue.' })
    if (store.getSettings().maintenanceMode && req.authUser.role !== 'admin') {
      return res.status(503).json({ error: 'StudyAI is temporarily unavailable for maintenance.' })
    }
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      return requireCsrf(req, res, next)
    }
    next()
  })
}
