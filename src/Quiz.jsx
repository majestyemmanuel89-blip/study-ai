import { useState } from 'react'
import './Quiz.css'

const QUESTION_COUNTS = [5, 10]

export default function Quiz({ csrfToken }) {
  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState('mixed')
  const [questionCount, setQuestionCount] = useState(5)
  const [quiz, setQuiz] = useState(null)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState(null)
  const [answers, setAnswers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const currentQuestion = quiz?.questions[questionIndex]
  const answerChecked = answers[questionIndex] !== undefined
  const isComplete = quiz && questionIndex >= quiz.questions.length

  async function createQuiz(event) {
    event.preventDefault()
    if (loading || !topic.trim()) return

    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ topic: topic.trim(), difficulty, questionCount }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || `Quiz generation failed (${response.status}).`)
      }
      if (!Array.isArray(data.questions) || data.questions.length !== questionCount) {
        throw new Error('The generated quiz was incomplete. Please try again.')
      }

      setQuiz(data)
      setQuestionIndex(0)
      setSelectedOption(null)
      setAnswers([])
    } catch (requestError) {
      setError(requestError.message || 'Could not generate your quiz. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function checkAnswer() {
    if (selectedOption === null || !currentQuestion) return
    setAnswers(current => {
      const nextAnswers = [...current]
      nextAnswers[questionIndex] = selectedOption
      return nextAnswers
    })
  }

  function continueQuiz() {
    setQuestionIndex(index => index + 1)
    setSelectedOption(null)
  }

  function startOver() {
    setQuiz(null)
    setQuestionIndex(0)
    setSelectedOption(null)
    setAnswers([])
    setError('')
  }

  if (!quiz) {
    return (
      <section className="study-quiz-builder">
        <div className="quiz-builder-heading">
          <span className="study-quiz-icon" aria-hidden="true">?</span>
          <div>
            <span className="study-section-kicker">PERSONALIZED PRACTICE</span>
            <h2>What would you like to practice?</h2>
            <p>Choose a topic and StudyAI will make a quiz just for you.</p>
          </div>
        </div>

        <form className="study-quiz-form" onSubmit={createQuiz}>
          <label className="study-quiz-topic">
            <span>Topic or subject</span>
            <input
              value={topic}
              onChange={event => setTopic(event.target.value)}
              placeholder="e.g. photosynthesis, fractions, World War II"
              maxLength={160}
              required
              disabled={loading}
            />
          </label>

          <div className="study-quiz-settings">
            <label>
              <span>Difficulty</span>
              <select value={difficulty} onChange={event => setDifficulty(event.target.value)} disabled={loading}>
                <option value="mixed">Mixed</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <label>
              <span>Questions</span>
              <select
                value={questionCount}
                onChange={event => setQuestionCount(Number(event.target.value))}
                disabled={loading}
              >
                {QUESTION_COUNTS.map(count => (
                  <option value={count} key={count}>{count} questions</option>
                ))}
              </select>
            </label>
          </div>

          {error && <p className="study-quiz-error" role="alert">{error}</p>}

          <button className="study-primary-button study-quiz-start" type="submit" disabled={loading || !topic.trim()}>
            {loading ? 'Creating your quiz…' : 'Create quiz'}
            {!loading && <span aria-hidden="true">→</span>}
          </button>
          <p className="study-quiz-note">Your score and answers are shown when you finish.</p>
        </form>
      </section>
    )
  }

  if (isComplete) {
    const score = answers.filter((answer, index) => answer === quiz.questions[index].correctIndex).length
    const percentage = Math.round((score / quiz.questions.length) * 100)

    return (
      <section className="study-quiz-results" aria-live="polite">
        <span className="study-quiz-icon" aria-hidden="true">✓</span>
        <span className="study-section-kicker">QUIZ COMPLETE</span>
        <h2>{percentage >= 80 ? 'Excellent work!' : percentage >= 50 ? 'Good effort!' : 'Keep practicing!'}</h2>
        <p className="study-quiz-score">{score}<span> / {quiz.questions.length}</span></p>
        <p className="study-quiz-result-copy">
          You got {score} {score === 1 ? 'question' : 'questions'} right on <strong>{quiz.topic}</strong>.
        </p>
        <div className="study-quiz-result-actions">
          <button className="study-primary-button" onClick={startOver}>Try another quiz</button>
          <button
            className="study-quiz-secondary-button"
            onClick={() => {
              setAnswers([])
              setQuestionIndex(0)
              setSelectedOption(null)
            }}
          >
            Retry this quiz
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="study-quiz-player">
      <div className="study-quiz-progress-heading">
        <div>
          <span className="study-section-kicker">{quiz.topic}</span>
          <h2>Question {questionIndex + 1} <span>of {quiz.questions.length}</span></h2>
        </div>
        <span className="study-quiz-difficulty">{quiz.difficulty} difficulty</span>
      </div>
      <div
        className="study-quiz-progress"
        role="progressbar"
        aria-label="Quiz progress"
        aria-valuemin={0}
        aria-valuemax={quiz.questions.length}
        aria-valuenow={questionIndex + (answerChecked ? 1 : 0)}
      >
        <span style={{ width: `${((questionIndex + (answerChecked ? 1 : 0)) / quiz.questions.length) * 100}%` }} />
      </div>

      <h3 className="study-quiz-question">{currentQuestion.question}</h3>
      <div className="study-quiz-options" role="group" aria-label="Answer choices">
        {currentQuestion.options.map((option, index) => {
          const isCorrect = answerChecked && index === currentQuestion.correctIndex
          const isIncorrectSelection = answerChecked && answers[questionIndex] === index && !isCorrect
          return (
            <button
              className={[
                'study-quiz-option',
                selectedOption === index ? 'is-selected' : '',
                isCorrect ? 'is-correct' : '',
                isIncorrectSelection ? 'is-incorrect' : '',
              ].filter(Boolean).join(' ')}
              key={`${index}-${option}`}
              onClick={() => setSelectedOption(index)}
              disabled={answerChecked}
              aria-pressed={selectedOption === index}
            >
              <span className="study-quiz-option-letter">{String.fromCharCode(65 + index)}</span>
              <span>{option}</span>
              {isCorrect && <span className="study-quiz-option-mark">Correct</span>}
              {isIncorrectSelection && <span className="study-quiz-option-mark">Your answer</span>}
            </button>
          )
        })}
      </div>

      {answerChecked && (
        <div className={`study-quiz-explanation${answers[questionIndex] === currentQuestion.correctIndex ? ' is-correct' : ' is-incorrect'}`} role="status">
          <strong>{answers[questionIndex] === currentQuestion.correctIndex ? 'That’s right!' : 'Not quite.'}</strong>
          <p>{currentQuestion.explanation}</p>
        </div>
      )}

      <div className="study-quiz-player-actions">
        <button className="study-quiz-secondary-button" onClick={startOver}>Exit quiz</button>
        {answerChecked ? (
          <button className="study-primary-button" onClick={continueQuiz}>
            {questionIndex === quiz.questions.length - 1 ? 'See results' : 'Next question'}
            <span aria-hidden="true">→</span>
          </button>
        ) : (
          <button className="study-primary-button" onClick={checkAnswer} disabled={selectedOption === null}>
            Check answer
          </button>
        )}
      </div>
    </section>
  )
}
