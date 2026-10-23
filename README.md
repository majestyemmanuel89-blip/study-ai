# StudyAI

StudyAI is a React/Vite study workspace backed by an Express API and SQLite.

## Requirements

- Node.js 22.13 or newer (the backend uses Node's built-in SQLite module)
- npm
- A Gemini API key for tutor and quiz generation

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `GEMINI_API_KEY`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `.env`. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
   - The admin password must be 5-10 characters. This is shorter than recommended; use this only for a private local development setup, not a publicly accessible deployment.
   - The configured email is provisioned with the administrator role when the backend starts.
   - The configured admin password is applied on each backend startup. Change it in `.env` to rotate it.
4. Start the API in one terminal with `npm run dev:server`.
5. Start the frontend in another terminal with `npm run dev`.

The active application database is SQLite at `data/studyai.sqlite`. Keep the `data` directory private and back it up as part of deployment operations. Set `DATABASE_PATH` to change its location. Never commit `.env` or database files.

`db.js` exports a Turso/libSQL client configured with `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Add those values to `.env` to use the helper. The existing authentication, chat, and activity storage still uses SQLite; adding the client helper does not migrate or switch the app's persistence.

## Accounts and admin access

- Students can create an account with an email and password. Passwords are stored as salted scrypt hashes.
- Sign-in uses an HTTP-only, same-site session cookie and CSRF tokens for authenticated writes.
- Chat history is associated with the signed-in account and syncs to the SQLite database. Existing browser-local chats are merged into the account on sign-in.
- The admin panel is not in the student navigation. Signing in with the configured administrator account opens it. Admin APIs independently verify the administrator role.
- The panel provides account activation controls, basic usage counts, editable Overview copy, sign-up control, maintenance mode, and a recent-activity feed for sign-ins, account creation, learning requests, and admin changes.
- Google sign-in uses the OAuth authorization-code flow and requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. For local development, set `GOOGLE_REDIRECT_URI` to `http://127.0.0.1:5173/api/auth/google/callback`. On Render, the server derives the HTTPS callback from `RENDER_EXTERNAL_URL` when `GOOGLE_REDIRECT_URI` is missing or invalid; register `https://<your-render-host>/api/auth/google/callback` in Google Cloud Console. For a custom production domain, set `GOOGLE_REDIRECT_URI` to that domain's exact HTTPS callback and register the same URI in Google Cloud Console. Restart the API after changing environment variables.
- Google accounts must provide a verified email. Existing accounts with the same verified email are signed in, while new Google accounts follow the admin sign-up setting. Google sign-in respects disabled accounts and does not change an existing account's role.
- For production, serve over HTTPS and set `NODE_ENV=production` so session cookies use the `Secure` attribute.

## Billing

- Premium and Pro use one-time Paystack payments in NGN: ₦2,500 and ₦5,000 respectively. Each successful payment grants 30 days; plans do not renew automatically.
- Set `PAYSTACK_SECRET_KEY` to a Paystack test secret key in local development. Never put the secret key in frontend code, commit it, or send it in chat.
- Set `APP_BASE_URL` to the exact frontend origin, such as `http://localhost:5173` locally or your HTTPS production domain. Production billing requires HTTPS.
- In the Paystack dashboard, configure the webhook URL as `<APP_BASE_URL>/api/billing/paystack/webhook`. The app verifies webhook signatures and independently verifies transactions with Paystack before activating access.
- Premium includes 30 AI Tutor requests and 10 quiz generations per UTC day. Pro includes 100 AI Tutor requests and 30 quiz generations per UTC day. Administrator accounts receive Pro access without a payment.
- Only Dark Theme Studio and these usage limits are available paid features; other planned features are not included in checkout.

## Commands

- `npm run dev` — Vite frontend
- `npm run dev:server` — Express API
- `npm run build` — production frontend build
- `npm run lint` — ESLint

# study-ai
