import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash, createHmac } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { DARK_THEMES, DEFAULT_THEME_ID } from './src/themes.js'
import { DAILY_USAGE_LIMITS, PLAN_ACCESS_MS, PLAN_PRICES_NGN as PAID_PLAN_PRICES } from './src/planCatalog.js'

export { DAILY_USAGE_LIMITS, PAID_PLAN_PRICES }

const SESSION_COOKIE = 'studyai_session'
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000
const AUTH_ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const AUTH_COOLDOWN_MS = 15 * 1000
const MAX_AUTH_ATTEMPTS = 10
const GOOGLE_CALLBACK_PATH = '/api/auth/google/callback'
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

function isValidGoogleRedirectUri(value, requireHttps) {
  try {
    const callback = new URL(value)
    return ['http:', 'https:'].includes(callback.protocol)
      && callback.pathname === GOOGLE_CALLBACK_PATH
      && !callback.username
      && !callback.password
      && !callback.search
      && !callback.hash
      && (!requireHttps || callback.protocol === 'https:')
  } catch {
    return false
  }
}

function safeUser(user) {
  const planExpiresAt = Number.isFinite(user.plan_expires_at) ? user.plan_expires_at : null
  const planExpired = planExpiresAt !== null && planExpiresAt <= Date.now()
  const plan = user.role === 'admin' ? 'pro' : planExpired ? 'free' : user.plan || 'free'

  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    plan,
    planExpiresAt: user.role === 'admin' || planExpired ? null : planExpiresAt,
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
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS password_reset_tokens_expiry_idx ON password_reset_tokens(expires_at);
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
    CREATE TABLE IF NOT EXISTS billing_payments (
      reference TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan TEXT NOT NULL CHECK (plan IN ('premium', 'pro')),
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL CHECK (currency = 'NGN'),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
      created_at INTEGER NOT NULL,
      paid_at INTEGER,
      expires_at INTEGER,
      provider_transaction_id TEXT
    );
    CREATE INDEX IF NOT EXISTS billing_payments_user_idx ON billing_payments(user_id, created_at DESC);
  `)

  const userColumns = database.prepare('PRAGMA table_info(users)').all()
  if (!userColumns.some(column => column.name === 'plan')) {
    database.exec("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium', 'pro'))")
  }
  if (!userColumns.some(column => column.name === 'plan_expires_at')) {
    database.exec('ALTER TABLE users ADD COLUMN plan_expires_at INTEGER')
  }

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
    deleteExpiredPasswordResetTokens: database.prepare('DELETE FROM password_reset_tokens WHERE expires_at <= ?'),
    deletePasswordResetTokensForUser: database.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?'),
    insertPasswordResetToken: database.prepare(`
      INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)
    `),
    passwordResetToken: database.prepare(`
      SELECT user_id, expires_at FROM password_reset_tokens WHERE token_hash = ?
    `),
    resetUserPassword: database.prepare('UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?'),
    updateLogin: database.prepare('UPDATE users SET last_login_at = ? WHERE id = ?'),
    addEvent: database.prepare('INSERT INTO usage_events (user_id, event_type, created_at) VALUES (?, ?, ?)'),
    countDailyUsage: database.prepare(`
      SELECT COUNT(*) AS count
      FROM usage_events
      WHERE user_id = ?
        AND event_type = ?
        AND created_at >= ?
    `),
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
      SELECT id, email, display_name, role, plan, is_active, created_at, last_login_at
      FROM users ORDER BY created_at DESC
    `),
    updateUserActive: database.prepare('UPDATE users SET is_active = ? WHERE id = ?'),
    updateUserPlan: database.prepare('UPDATE users SET plan = ?, plan_expires_at = NULL WHERE id = ?'),
    addPendingPayment: database.prepare(`
      INSERT INTO billing_payments (reference, user_id, plan, amount, currency, created_at)
      VALUES (?, ?, ?, ?, 'NGN', ?)
    `),
    paymentByReference: database.prepare(`
      SELECT billing_payments.*, users.email AS user_email
      FROM billing_payments JOIN users ON users.id = billing_payments.user_id
      WHERE billing_payments.reference = ?
    `),
    deletePendingPayment: database.prepare("DELETE FROM billing_payments WHERE reference = ? AND status = 'pending'"),
    markPaymentPaid: database.prepare(`
      UPDATE billing_payments
      SET status = 'paid', paid_at = ?, expires_at = ?, provider_transaction_id = ?
      WHERE reference = ? AND status = 'pending'
    `),
    updatePaidPlan: database.prepare('UPDATE users SET plan = ?, plan_expires_at = ? WHERE id = ?'),
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
    createPasswordResetToken(userId) {
      const now = Date.now()
      queries.deleteExpiredPasswordResetTokens.run(now)
      queries.deletePasswordResetTokensForUser.run(userId)
      const token = randomBytes(32).toString('hex')
      queries.insertPasswordResetToken.run(hashToken(token), userId, now + 60 * 60 * 1000, now)
      return token
    },
    resetPassword(token, password) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return false
      database.exec('BEGIN IMMEDIATE')
      try {
        const reset = queries.passwordResetToken.get(hashToken(token))
        if (!reset || reset.expires_at <= Date.now()) {
          database.exec('ROLLBACK')
          return false
        }
        const credentials = hashPassword(password)
        queries.resetUserPassword.run(credentials.salt, credentials.hash, reset.user_id)
        queries.deleteUserSessions.run(reset.user_id)
        queries.deletePasswordResetTokensForUser.run(reset.user_id)
        database.exec('COMMIT')
        return true
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    },
    updateLastLogin(userId) {
      queries.updateLogin.run(Date.now(), userId)
    },
    recordUsage(userId, eventType) {
      queries.addEvent.run(userId, eventType, Date.now())
    },
    consumeDailyUsage(userId, eventType, limit) {
      const now = new Date()
      now.setUTCHours(0, 0, 0, 0)
      const dayStart = now.getTime()

      database.exec('BEGIN IMMEDIATE')

      try {
        const result = queries.countDailyUsage.get(
          userId,
          eventType,
          dayStart,
        )
        const used = Number(result.count)

        if (used >= limit) {
          database.exec('COMMIT')
          return {
            allowed: false,
            used,
            limit,
            remaining: 0,
          }
        }

        queries.addEvent.run(userId, eventType, Date.now())
        database.exec('COMMIT')

        return {
          allowed: true,
          used: used + 1,
          limit,
          remaining: limit - used - 1,
        }
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    },
    getDailyUsage(userId, eventType) {
      const now = new Date()
      now.setUTCHours(0, 0, 0, 0)

      const result = queries.countDailyUsage.get(
        userId,
        eventType,
        now.getTime(),
      )

      return Number(result.count)
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
    setUserPlan(userId, plan) {
      if (!['free', 'premium', 'pro'].includes(plan)) {
        return { error: 'Choose a valid account plan.' }
      }
      const result = queries.updateUserPlan.run(plan, userId)
      return result.changes > 0 ? { plan } : { error: 'Account not found.' }
    },
    createPendingPayment({ userId, reference, plan, amount }) {
      queries.addPendingPayment.run(reference, userId, plan, amount, Date.now())
    },
    deletePendingPayment(reference) {
      queries.deletePendingPayment.run(reference)
    },
    getPayment(reference) {
      return queries.paymentByReference.get(reference) || null
    },
    completePayment(reference, providerTransactionId) {
      database.exec('BEGIN IMMEDIATE')
      try {
        const payment = queries.paymentByReference.get(reference)
        if (!payment) {
          database.exec('COMMIT')
          return { error: 'Payment reference was not found.' }
        }
        if (payment.status === 'paid') {
          database.exec('COMMIT')
          return { plan: payment.plan, expiresAt: payment.expires_at, alreadyProcessed: true }
        }

        const user = queries.userById.get(payment.user_id)
        if (!user) {
          database.exec('COMMIT')
          return { error: 'Account was not found.' }
        }

        const now = Date.now()
        const accessStartsAt = user.plan_expires_at > now ? user.plan_expires_at : now
        const expiresAt = accessStartsAt + PLAN_ACCESS_MS
        queries.markPaymentPaid.run(now, expiresAt, String(providerTransactionId), reference)
        queries.updatePaidPlan.run(payment.plan, expiresAt, payment.user_id)
        database.exec('COMMIT')
        return { plan: payment.plan, expiresAt, alreadyProcessed: false }
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    },
    getTheme(userId) {
      const storedTheme = getStoredValue(`user.${userId}.theme`, { id: DEFAULT_THEME_ID })
      return storedTheme && DARK_THEMES.some(theme => theme.id === storedTheme.id)
        ? { id: storedTheme.id }
        : { id: DEFAULT_THEME_ID }
    },
    setTheme(userId, values) {
      const user = queries.userById.get(userId)
      if (!user) return { error: 'Account not found.' }
      if (user.role !== 'admin' && !['premium', 'pro'].includes(user.plan)) {
        return { error: 'Dark Theme Studio is available on Premium and Pro plans.' }
      }
      const themeId = values?.id
      if (!DARK_THEMES.some(theme => theme.id === themeId)) {
        return { error: 'Choose one of the available Dark Theme Studio themes.' }
      }
      const theme = { id: themeId }
      queries.setValue.run(`user.${userId}.theme`, JSON.stringify(theme), Date.now())
      return { theme }
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
  const passwordResetAttempts = new Map()
  const cookieSecure = process.env.NODE_ENV === 'production'
  const oauthStateCookie = 'studyai_google_state'
  const getGoogleConfig = () => {
    let redirectUri = process.env.GOOGLE_REDIRECT_URI
    if (
      process.env.RENDER_EXTERNAL_URL
      && !isValidGoogleRedirectUri(redirectUri, true)
    ) {
      try {
        const publicUrl = new URL(process.env.RENDER_EXTERNAL_URL)
        if (
          publicUrl.protocol === 'https:'
          && !publicUrl.username
          && !publicUrl.password
          && !publicUrl.search
          && !publicUrl.hash
        ) {
          redirectUri = new URL(GOOGLE_CALLBACK_PATH, publicUrl).toString()
        }
      } catch {
        redirectUri = process.env.GOOGLE_REDIRECT_URI
      }
    }

    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri,
    }
  }
  const googleConfigured = () => {
    const { clientId, clientSecret, redirectUri } = getGoogleConfig()
    if (!clientId || !clientSecret || !redirectUri) return false
    return isValidGoogleRedirectUri(redirectUri, process.env.NODE_ENV === 'production')
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

  const allowPasswordResetAttempt = (req, res, next) => {
    const now = Date.now()
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    const recentAttempts = (passwordResetAttempts.get(ip) || [])
      .filter(timestamp => now - timestamp < AUTH_ATTEMPT_WINDOW_MS)
    if (recentAttempts.length >= MAX_AUTH_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes before trying again.' })
    }
    recentAttempts.push(now)
    passwordResetAttempts.set(ip, recentAttempts)
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

  function getAppBaseUrl(req) {
    const configuredUrl = process.env.APP_BASE_URL?.trim()
    if (process.env.NODE_ENV === 'production' && !configuredUrl) {
      throw new Error('APP_BASE_URL must be configured for production billing.')
    }
    const baseUrl = new URL(configuredUrl || req.get('origin') || `${req.protocol}://${req.get('host')}`)
    if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
      throw new Error('APP_BASE_URL is invalid.')
    }
    if (process.env.NODE_ENV === 'production' && baseUrl.protocol !== 'https:') {
      throw new Error('APP_BASE_URL must use HTTPS in production.')
    }
    return baseUrl.origin
  }

  async function verifyPaystackPayment(reference, payment) {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      signal: AbortSignal.timeout(15000),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok || result?.status !== true) {
      throw new Error('Paystack could not verify the transaction.')
    }

    const transaction = result.data
    return transaction
      && transaction.reference === reference
      && transaction.status === 'success'
      && Number(transaction.amount) === payment.amount
      && transaction.currency === payment.currency
      && transaction.customer?.email?.toLowerCase() === payment.user_email.toLowerCase()
      && transaction.id !== undefined
      ? { transactionId: transaction.id }
      : null
  }

  function redirectBillingResult(req, res, status) {
    try {
      const destination = new URL(getAppBaseUrl(req))
      destination.searchParams.set('billing', status)
      res.redirect(destination.toString())
    } catch {
      res.status(503).send('Billing callback is not configured.')
    }
  }

  app.post('/api/billing/checkout', checkOrigin, requireUser, requireCsrf, async (req, res) => {
    const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim()
    if (!secretKey) {
      return res.status(503).json({ error: 'Online payments are not configured yet.' })
    }
    const plan = req.body?.plan
    if (!['premium', 'pro'].includes(plan)) {
      return res.status(400).json({ error: 'Choose a valid paid plan.' })
    }
    if (req.authUser.role === 'admin') {
      return res.status(409).json({ error: 'Administrator accounts already have Pro access.' })
    }

    let appBaseUrl
    try {
      appBaseUrl = getAppBaseUrl(req)
    } catch {
      return res.status(503).json({ error: 'Billing is not configured for this website yet.' })
    }

    const reference = `studyai-${randomUUID()}`
    const amount = PAID_PLAN_PRICES[plan] * 100
    try {
      store.createPendingPayment({ userId: req.authUser.id, reference, plan, amount })
      const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: req.authUser.email,
          amount: String(amount),
          currency: 'NGN',
          reference,
          callback_url: new URL('/api/billing/paystack/callback', appBaseUrl).toString(),
          metadata: { user_id: req.authUser.id, plan },
        }),
        signal: AbortSignal.timeout(15000),
      })
      const result = await response.json().catch(() => null)
      let authorizationUrl
      try {
        authorizationUrl = new URL(result?.data?.authorization_url)
      } catch {
        authorizationUrl = null
      }
      if (
        !response.ok
        || result?.status !== true
        || result.data.reference !== reference
        || authorizationUrl?.origin !== 'https://checkout.paystack.com'
      ) {
        store.deletePendingPayment(reference)
        return res.status(502).json({ error: 'Could not start checkout. Please try again.' })
      }

      res.json({ authorizationUrl: authorizationUrl.toString() })
    } catch (error) {
      store.deletePendingPayment(reference)
      console.error('Paystack checkout initialization failed:', error.message)
      res.status(502).json({ error: 'Could not start checkout. Please try again.' })
    }
  })

  app.get('/api/billing/paystack/callback', async (req, res) => {
    const reference = typeof req.query.reference === 'string' ? req.query.reference : ''
    const payment = reference ? store.getPayment(reference) : null
    if (!payment || !process.env.PAYSTACK_SECRET_KEY) {
      return redirectBillingResult(req, res, 'failed')
    }

    try {
      const verification = await verifyPaystackPayment(reference, payment)
      if (!verification) return redirectBillingResult(req, res, 'failed')
      const result = store.completePayment(reference, verification.transactionId)
      if (result.error) return redirectBillingResult(req, res, 'failed')
      if (!result.alreadyProcessed) store.recordUsage(payment.user_id, 'plan_purchase')
      redirectBillingResult(req, res, 'success')
    } catch (error) {
      console.error('Paystack callback verification failed:', error.message)
      redirectBillingResult(req, res, 'failed')
    }
  })

  app.post('/api/billing/paystack/webhook', async (req, res) => {
    const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim()
    const signature = req.get('x-paystack-signature') || ''
    if (!secretKey) return res.status(503).json({ error: 'Payment verification is not configured.' })
    if (!req.rawBody || !/^[a-f0-9]{128}$/i.test(signature)) {
      return res.status(401).json({ error: 'Invalid webhook signature.' })
    }

    const expectedSignature = createHmac('sha512', secretKey).update(req.rawBody).digest()
    const suppliedSignature = Buffer.from(signature, 'hex')
    if (!timingSafeEqual(expectedSignature, suppliedSignature)) {
      return res.status(401).json({ error: 'Invalid webhook signature.' })
    }

    const reference = req.body?.event === 'charge.success' && req.body.data?.reference
    if (typeof reference !== 'string') return res.json({ received: true })
    const payment = store.getPayment(reference)
    if (!payment) return res.json({ received: true })

    try {
      const verification = await verifyPaystackPayment(reference, payment)
      if (!verification) return res.status(502).json({ error: 'Payment could not yet be verified.' })
      const result = store.completePayment(reference, verification.transactionId)
      if (result.error) return res.status(502).json({ error: 'Payment could not yet be applied.' })
      if (!result.alreadyProcessed) store.recordUsage(payment.user_id, 'plan_purchase')
      res.json({ received: true })
    } catch (error) {
      console.error('Paystack webhook verification failed:', error.message)
      res.status(502).json({ error: 'Payment could not yet be verified.' })
    }
  })

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
      theme: req.authUser ? store.getTheme(req.authUser.id) : null,
      googleConfigured: googleConfigured(),
      content: store.getContent(),
      settings: store.getSettings(),
    })
  })

  app.get('/api/usage', requireUser, (req, res) => {
    res.set('Cache-Control', 'no-store')
    const plan = req.authUser.role === 'admin' ? 'pro' : req.authUser.plan
    const tutorLimit = DAILY_USAGE_LIMITS[plan].tutor_request
    const quizLimit = DAILY_USAGE_LIMITS[plan].quiz_generation
    const tutorUsed = store.getDailyUsage(req.authUser.id, 'tutor_request')
    const quizUsed = store.getDailyUsage(req.authUser.id, 'quiz_generation')
    const nextReset = new Date()
    nextReset.setUTCHours(24, 0, 0, 0)

    res.json({
      usage: {
        plan,
        tutor: {
          used: tutorUsed,
          limit: tutorLimit,
          remaining: Math.max(0, tutorLimit - tutorUsed),
        },
        quiz: {
          used: quizUsed,
          limit: quizLimit,
          remaining: Math.max(0, quizLimit - quizUsed),
        },
        resetsAt: nextReset.toISOString(),
      },
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
    res.status(201).json({
      user: safeUser(user),
      csrfToken: session.csrfToken,
      theme: store.getTheme(user.id),
    })
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
    res.json({
      user: safeUser(user),
      csrfToken: session.csrfToken,
      theme: store.getTheme(user.id),
    })
  })

  app.post('/api/auth/password-reset-request', checkOrigin, allowPasswordResetAttempt, async (req, res) => {
    const { email } = req.body ?? {}
    if (typeof email !== 'string' || !isValidEmail(normalizeEmail(email))) {
      return res.status(400).json({ error: 'Enter a valid email address.' })
    }
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
      return res.status(503).json({ error: 'Password recovery is not configured on this server.' })
    }

    let resetUrl
    try {
      resetUrl = new URL('/', getAppBaseUrl(req))
    } catch {
      return res.status(503).json({ error: 'Password recovery is not configured on this server.' })
    }

    const user = store.findUserByEmail(normalizeEmail(email))
    if (user) {
      const token = store.createPasswordResetToken(user.id)
      resetUrl.searchParams.set('resetToken', token)
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM,
            to: [user.email],
            subject: 'Reset your StudyAI password',
            html: `<p>We received a request to reset your StudyAI password.</p><p><a href="${resetUrl.toString()}">Choose a new password</a></p><p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>`,
            text: `We received a request to reset your StudyAI password. Choose a new password here: ${resetUrl.toString()} This link expires in 1 hour. If you did not request this, you can ignore this email.`,
          }),
          signal: AbortSignal.timeout(15000),
        })
        if (!response.ok) throw new Error(`Resend request failed (${response.status}).`)
      } catch (error) {
        console.error('Password reset email delivery failed:', error.message)
      }
    }

    res.set('Cache-Control', 'no-store')
    res.status(202).json({ message: 'If an account exists for that email, a password reset link will be sent.' })
  })

  app.post('/api/auth/password-reset', checkOrigin, (req, res) => {
    const { token, password } = req.body ?? {}
    if (typeof token !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'This password reset link is invalid or expired.' })
    }
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      return res.status(400).json({ error: `Your password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters.` })
    }
    if (!store.resetPassword(token, password)) {
      return res.status(400).json({ error: 'This password reset link is invalid or expired. Request a new one.' })
    }
    res.set('Cache-Control', 'no-store')
    res.json({ message: 'Your password has been updated. Sign in with your new password.' })
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

  app.get('/api/account/theme', requireUser, (req, res) => {
    res.json({ theme: store.getTheme(req.authUser.id) })
  })

  app.put('/api/account/theme', checkOrigin, requireUser, requireCsrf, (req, res) => {
    if (req.authUser.role !== 'admin' && !['premium', 'pro'].includes(req.authUser.plan)) {
      return res.status(403).json({ error: 'Dark Theme Studio is available on Premium and Pro plans.' })
    }
    const result = store.setTheme(req.authUser.id, req.body ?? {})
    if (result.error) return res.status(400).json({ error: result.error })
    store.recordUsage(req.authUser.id, 'account_theme_updated')
    res.json(result)
  })

  app.get('/api/admin/users', requireAdmin, (_req, res) => {
    res.json({ users: store.getUsers() })
  })

  app.patch('/api/admin/users/:id/plan', checkOrigin, requireAdmin, requireCsrf, (req, res) => {
    const result = store.setUserPlan(req.params.id, req.body?.plan)
    if (result.error) {
      return res.status(result.error === 'Account not found.' ? 404 : 400).json({ error: result.error })
    }
    store.recordUsage(req.authUser.id, 'admin_user_plan_updated')
    res.json({ success: true, plan: result.plan })
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
