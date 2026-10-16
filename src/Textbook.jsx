
import { useRef, useState, useEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import './Textbook.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

function Textbook() {
  const [book, setBook] = useState(null)
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const [asking, setAsking] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const fileInput = useRef(null)
  const bookUrl = useRef(null)

  useEffect(() => {
    return () => {
      if (bookUrl.current) URL.revokeObjectURL(bookUrl.current)
    }
  }, [])

  async function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setError('')
    setAnswer('')
    setBook(null)

    if (file.type !== 'application/pdf') {
      setError('Please choose a PDF textbook.')
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      setError('Please choose a PDF smaller than 20 MB.')
      return
    }

    setReading(true)

    try {
      const data = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({
        data: new Uint8Array(data),
      }).promise

      let extractedText = ''

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber)
        const content = await page.getTextContent()

        const pageText = content.items
          .map(item => 'str' in item ? item.str : '')
          .join(' ')

        extractedText += `\n\nPage ${pageNumber}\n${pageText}`

        if (extractedText.length > 500000) {
          extractedText = extractedText.slice(0, 500000)
          break
        }
      }

      if (!extractedText.trim()) {
        throw new Error(
          'No selectable text was found. This PDF may be scanned images.'
        )
      }

      if (bookUrl.current) URL.revokeObjectURL(bookUrl.current)

      const url = URL.createObjectURL(file)
      bookUrl.current = url

      setBook({
        name: file.name,
        url,
        pages: pdf.numPages,
        text: extractedText,
      })
    } catch (err) {
      setError(err.message || 'Could not read this PDF.')
    } finally {
      setReading(false)
    }
  }

  async function answerFromBook() {
    if (!book || !question.trim() || asking) return

    setAsking(true)
    setAnswer('')
    setError('')

    try {
      const words = [
        ...new Set(
          question.toLowerCase().match(/[a-z0-9]{4,}/g) || []
        ),
      ]

      const passages = book.text
        .split(/(?=Page \d+)/)
        .map(text => {
          const lowerText = text.toLowerCase()
          const score = words.reduce((total, word) => {
            const matches = lowerText.split(word).length - 1
            return total + matches
          }, 0)

          return { text, score }
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)

      if (passages.length === 0) {
        setAnswer(
          'I could not find a matching passage. Try asking with keywords from your textbook.'
        )
        return
      }

      const textbookText = passages
        .map(item => item.text.trim())
        .join('\n\n')
        .slice(0, 12000)

      const response = await fetch('/api/tutor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: question.trim(),
          textbookText,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'The AI tutor could not respond.')
      }

      setAnswer(data.answer)
    } catch (err) {
      setAnswer(
        err.message || 'Something went wrong. Please try again.'
      )
    } finally {
      setAsking(false)
    }
  }

  return (
    <section className="textbook-panel">
      <div className="upload-heading">
        <div>
          <p className="eyebrow">YOUR PERSONAL LIBRARY</p>
          <h2>Study with your textbook</h2>
          <p className="upload-description">
            Upload a PDF and search its contents.
          </p>
        </div>
        <div className="upload-icon">▤</div>
      </div>

      <button
        className="drop-zone"
        onClick={() => fileInput.current?.click()}
        disabled={reading}
      >
        <span className="upload-symbol">↑</span>
        <strong>{reading ? 'Reading your textbook...' : 'Choose your textbook'}</strong>
        <span>PDF files up to 20 MB</span>
        <span className="browse-label">Browse files</span>
      </button>

      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={handleFile}
      />

      {error && <p className="upload-error">{error}</p>}

      {book && (
        <>
          <div className="uploaded-book">
            <div className="pdf-icon">PDF</div>
            <div className="book-details">
              <strong>{book.name}</strong>
              <span>{book.pages} pages · Text extracted</span>
            </div>
            <a href={book.url} target="_blank" rel="noreferrer">
              Open ↗
            </a>
            <button
              className="remove-book"
              onClick={() => {
                if (bookUrl.current) URL.revokeObjectURL(bookUrl.current)
                bookUrl.current = null
                setBook(null)
                setAnswer('')
                setQuestion('')
                if (fileInput.current) fileInput.current.value = ''
              }}
              aria-label="Remove textbook"
            >
              ×
            </button>
          </div>

          <div className="book-question">
            <label htmlFor="book-question">Search your textbook</label>
            <p>Ask about a topic to find relevant passages.</p>
            <textarea
              id="book-question"
              value={question}
              onChange={event => setQuestion(event.target.value)}
              placeholder="e.g. What is photosynthesis?"
              rows={3}
            />
            <button
              className="find-answer"
              onClick={answerFromBook}
              disabled={!question.trim() || asking}
            >
              {asking ? 'StudyAI is thinking...' : 'Teach me step by step →'}
            </button>
            {answer && <pre className="book-answer">{answer}</pre>}
          </div>
        </>
      )}

      <p className="upload-note">
        Your PDF is processed in this browser. It is not saved to a cloud account.
      </p>
    </section>
  )
}

export default Textbook
