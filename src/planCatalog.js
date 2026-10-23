export const PLAN_ACCESS_MS = 30 * 24 * 60 * 60 * 1000

export const PLAN_PRICES_NGN = Object.freeze({
  free: 0,
  premium: 2500,
  pro: 5000,
})

export const DAILY_USAGE_LIMITS = Object.freeze({
  free: Object.freeze({ tutor_request: 10, quiz_generation: 3 }),
  premium: Object.freeze({ tutor_request: 30, quiz_generation: 10 }),
  pro: Object.freeze({ tutor_request: 100, quiz_generation: 30 }),
})