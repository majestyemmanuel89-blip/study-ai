import { useState } from 'react'
import './Plans.css'
import { DAILY_USAGE_LIMITS, PLAN_PRICES_NGN } from './planCatalog'

const plans = [
  {
    id: 'free',
    name: 'Free',
    period: 'forever',
    description: 'Start learning with the essentials.',
    features: [
      'AI study assistant',
      'PDF textbook questions',
      'Basic study quizzes',
      `${DAILY_USAGE_LIMITS.free.tutor_request} AI Tutor requests and ${DAILY_USAGE_LIMITS.free.quiz_generation} quizzes per UTC day`,
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    period: 'one-time · 30 days',
    description: 'For students who want to study smarter.',
    features: [
      'Everything in Free',
      `${DAILY_USAGE_LIMITS.premium.tutor_request} AI Tutor requests per day`,
      `${DAILY_USAGE_LIMITS.premium.quiz_generation} quiz generations per day`,
      'Dark Theme Studio access',
    ],
    featured: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    period: 'one-time · 30 days',
    description: 'For serious learners who want more.',
    features: [
      'Everything in Premium',
      `${DAILY_USAGE_LIMITS.pro.tutor_request} AI Tutor requests per day`,
      `${DAILY_USAGE_LIMITS.pro.quiz_generation} quiz generations per day`,
      'Dark Theme Studio access',
    ],
  },
]

function Plans({ user, csrfToken, billingStatus = '' }) {
  const [checkoutPlan, setCheckoutPlan] = useState('')
  const [error, setError] = useState('')
  const currentPlan = user?.plan || 'free'
  const isAdmin = user?.role === 'admin'

  async function beginCheckout(plan) {
    if (checkoutPlan || isAdmin) return
    setCheckoutPlan(plan)
    setError('')
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ plan }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || `Checkout could not start (${response.status}).`)
      const authorizationUrl = new URL(data.authorizationUrl)
      if (authorizationUrl.origin !== 'https://checkout.paystack.com') {
        throw new Error('The payment provider returned an invalid checkout link.')
      }
      window.location.assign(authorizationUrl.toString())
    } catch (checkoutError) {
      setError(checkoutError.message || 'Checkout could not start. Please try again.')
    } finally {
      setCheckoutPlan('')
    }
  }

  return (
    <section className="plans-page" aria-labelledby="plans-title">
      <header className="plans-heading">
        <span className="plans-eyebrow">STUDYAI MEMBERSHIP</span>
        <h1 id="plans-title">Choose how you learn.</h1>
        <p>Choose the access that fits your study routine.</p>
      </header>

      {billingStatus === 'success' && (
        <p className="plans-feedback is-success" role="status">Payment verified. Your plan is active for 30 days.</p>
      )}
      {billingStatus === 'failed' && (
        <p className="plans-feedback is-error" role="alert">We couldn’t confirm that payment yet. If you were charged, refresh shortly or contact support.</p>
      )}
      {error && <p className="plans-feedback is-error" role="alert">{error}</p>}
      {isAdmin && <p className="plans-feedback" role="status">Administrator account · Pro access is included.</p>}
      {!isAdmin && currentPlan !== 'free' && user.planExpiresAt && (
        <p className="plans-feedback" role="status">
          {currentPlan === 'pro' ? 'Pro' : 'Premium'} access through{' '}
          {new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(user.planExpiresAt)}.
        </p>
      )}

      <div className="plans-grid">
        {plans.map(plan => {
          const isCurrent = plan.id === currentPlan
          const isIncluded = currentPlan === 'pro' && plan.id !== 'pro'
          const isUnavailable = plan.id === 'free' || isIncluded || isAdmin
          const buttonLabel = isAdmin
            ? plan.id === 'pro' ? 'Administrator access' : 'Included with Pro'
            : isCurrent
              ? plan.id === 'free' ? 'Current plan' : `Renew ${plan.name}`
              : isIncluded
                ? 'Included with Pro'
                : `Choose ${plan.name}`

          return (
          <article
            className={`plan-card${plan.featured ? ' plan-featured' : ''}`}
            key={plan.id}
          >
            {plan.featured && (
              <span className="plan-badge">POPULAR</span>
            )}

            <h2>{plan.name}</h2>
            <p className="plan-description">{plan.description}</p>

            <div className="plan-price">
              <strong>₦{PLAN_PRICES_NGN[plan.id].toLocaleString('en-NG')}</strong>
              <span>{plan.period}</span>
            </div>

            <ul className="plan-features">
              {plan.features.map((feature) => (
                <li key={feature}>
                  <span aria-hidden="true">✓</span>
                  {feature}
                </li>
              ))}
            </ul>

            <button
              className={`plan-button${isCurrent ? ' plan-button-current' : ''}`}
              type="button"
              disabled={isUnavailable || Boolean(checkoutPlan)}
              onClick={() => beginCheckout(plan.id)}
            >
              {checkoutPlan === plan.id ? 'Opening Paystack…' : buttonLabel}
            </button>
          </article>
          )
        })}
      </div>

      <p className="plans-note">
        One-time Paystack payment grants 30 days of access. Plans do not renew automatically; renew manually before access expires.
      </p>
    </section>
  )
}

export default Plans
