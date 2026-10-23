import './DailyUsage.css'

function UsageIcon({ type }) {
  if (type === 'tutor') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3 13.8 8.2 19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
        <path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      <path d="M9 15 21 3m-9 0h9v9" />
      <path d="m7 11 2 2 4-4" />
    </svg>
  )
}

function UsageCard({ kind, title, label, usage }) {
  const percentage = Math.min(100, Math.round((usage.used / usage.limit) * 100))
  const exhausted = usage.remaining === 0

  return (
    <article className={`daily-usage-card is-${kind}${exhausted ? ' is-exhausted' : ''}`}>
      <div className="daily-usage-card-heading">
        <span className="daily-usage-icon"><UsageIcon type={kind} /></span>
        <div>
          <h3>{title}</h3>
          <p>{usage.limit} {label} per day</p>
        </div>
      </div>

      <div className="daily-usage-numbers" aria-label={`${usage.used} of ${usage.limit} ${label} used`}>
        <strong>{usage.used}<span> / {usage.limit}</span></strong>
        <span className="daily-usage-remaining">
          {exhausted ? 'Limit reached' : `${usage.remaining} remaining`}
        </span>
      </div>

      <div
        className="daily-usage-progress"
        role="progressbar"
        aria-label={`${title} usage`}
        aria-valuemin={0}
        aria-valuemax={usage.limit}
        aria-valuenow={Math.min(usage.used, usage.limit)}
      >
        <span style={{ width: `${percentage}%` }} />
      </div>

      {exhausted && (
        <p className="daily-usage-exhausted">
          You’ve used today’s allowance. It resets at UTC midnight.
        </p>
      )}
    </article>
  )
}

export default function DailyUsage({ state, onRetry }) {
  return (
    <section className="daily-usage-section" aria-labelledby="daily-usage-title" aria-live="polite">
      <div className="daily-usage-heading">
        <div>
          <span className="study-overline">YOUR FREE-PLAN ALLOWANCE</span>
          <h2 id="daily-usage-title">Your Daily Usage</h2>
        </div>
        {state.usage?.resetsAt && (
          <span className="daily-usage-reset">
            Resets {new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }).format(new Date(state.usage.resetsAt))}
          </span>
        )}
      </div>

      {!state.usage && !state.error ? (
        <div className="daily-usage-grid" aria-label="Loading daily usage">
          {[0, 1].map(item => (
            <div className="daily-usage-skeleton" key={item}>
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      ) : state.error && !state.usage ? (
        <div className="daily-usage-error" role="alert">
          <p>{state.error}</p>
          <button type="button" onClick={onRetry}>Retry</button>
        </div>
      ) : (
        <div className="daily-usage-grid">
          <UsageCard kind="tutor" title="AI Tutor" label="requests" usage={state.usage.tutor} />
          <UsageCard kind="quiz" title="Quiz Generator" label="generations" usage={state.usage.quiz} />
          {state.error && (
            <p className="daily-usage-refresh-error" role="status">
              Usage could not be refreshed: {state.error}
              <button type="button" onClick={onRetry}>Retry</button>
            </p>
          )}
        </div>
      )}
    </section>
  )
}
