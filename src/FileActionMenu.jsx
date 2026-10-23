
import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import './FileActionMenu.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const MAX_FILE_SIZE = 20 * 1024 * 1024
const MAX_TEXTBOOK_LENGTH = 60000
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif)$/i
const FOLLOW_UP_SUGGESTIONS = [
  { label: 'Explain more simply', prompt: 'Explain that in simpler terms.' },
  { label: 'Give me an example', prompt: 'Give me a practical example of that.' },
  { label: 'Quiz me on this', prompt: 'Quiz me on this topic.' },
]

function isImageFile(file) {
  return IMAGE_MIME_TYPES.has(file.type) || IMAGE_EXTENSIONS.test(file.name)
}

function isSupportedFile(file) {
  return /\.(pdf|txt|md)$/i.test(file.name) || isImageFile(file)
}

const Icon = ({ name, size = 18 }) => {
  const paths = {
    paperclip: <><path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.49-8.48" /></>,
    folder: <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    drive: <><path d="m9 3-7 12 4 7 7-12z" /><path d="M9 3h7l7 12h-8z" /><path d="M6 22h14l3-7H9z" /></>,
    cloud: <><path d="M20 16.2A4.5 4.5 0 0 0 18 7.5a6 6 0 0 0-11.5 1.8A4 4 0 0 0 7 17h12" /><path d="m12 12-3 3m3-3 3 3m-3-3v8" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    chevron: <><path d="m9 18 6-6-6-6" /></>,
    copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8m-8 4h8" /></>,
    reply: <><path d="m9 17-5-5 5-5" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
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
      {paths[name] || paths.file}
    </svg>
  )
}

export default function FileActionMenu({
  documents = [],
  csrfToken,
  initialMessages = [],
  onChatStart,
  onMessagesChange,
  onFilesSelected,
  onSelectDocument,
  onConnect,
  onUsageChange,
  tutorRemaining,
  remainingUploads = 3,
  dailyUploadLimit = 5,
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [imagePreviews, setImagePreviews] = useState([])
  const [menuPosition, setMenuPosition] = useState(null)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState(initialMessages)
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState('')
  const [copiedMessageIndex, setCopiedMessageIndex] = useState(null)
  const fileInput = useRef(null)
  const questionInput = useRef(null)
  const attachButton = useRef(null)
  const menuElement = useRef(null)
  const imagePreviewUrls = useRef(new Map())

  const sendableFiles = selectedFiles.filter(file => !isImageFile(file))
  const imagePreviewUrlMap = new Map(imagePreviews.map(preview => [preview.file, preview.url]))
  const filteredDocuments = documents.filter(doc => {
    const name = typeof doc === 'string' ? doc : doc.name
    return name?.toLowerCase().includes(search.toLowerCase())
  })

  useEffect(() => {
    if (copiedMessageIndex === null) return undefined
    const timeoutId = window.setTimeout(() => setCopiedMessageIndex(null), 1800)
    return () => window.clearTimeout(timeoutId)
  }, [copiedMessageIndex])

  useEffect(() => () => {
    imagePreviewUrls.current.forEach(url => URL.revokeObjectURL(url))
    imagePreviewUrls.current.clear()
  }, [])

  useLayoutEffect(() => {
    if (!open) return undefined

    function positionMenu() {
      const anchor = attachButton.current?.getBoundingClientRect()
      const menu = menuElement.current
      if (!anchor || !menu) return

      const width = Math.min(390, Math.max(0, window.innerWidth - 24))
      const left = Math.min(
        Math.max(12, anchor.left),
        Math.max(12, window.innerWidth - width - 12),
      )
      const top = Math.max(12, anchor.top - menu.getBoundingClientRect().height - 12)
      setMenuPosition({ top: `${top}px`, left: `${left}px`, width: `${width}px` })
    }

    positionMenu()
    window.addEventListener('resize', positionMenu)
    window.addEventListener('scroll', positionMenu, true)
    return () => {
      window.removeEventListener('resize', positionMenu)
      window.removeEventListener('scroll', positionMenu, true)
    }
  }, [open, notice, search, selectedFiles.length, filteredDocuments.length])

  function handleFiles(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    const valid = files.filter(file => isSupportedFile(file) && file.size <= MAX_FILE_SIZE)

    if (!valid.length) {
      setNotice('Choose a PDF, TXT, Markdown or image file smaller than 20 MB.')
      return
    }

    imagePreviewUrls.current.forEach(url => URL.revokeObjectURL(url))
    imagePreviewUrls.current.clear()
    const previews = valid.filter(isImageFile).map(file => {
      const url = URL.createObjectURL(file)
      imagePreviewUrls.current.set(file, url)
      return { file, url }
    })
    setImagePreviews(previews)
    setSelectedFiles(valid)
    const skippedCount = files.length - valid.length
    const imageCount = valid.filter(isImageFile).length
    setNotice(skippedCount
      ? `${valid.length} selected; ${skippedCount} unsupported or oversized file${skippedCount === 1 ? '' : 's'} skipped`
      : `${valid.length} file${valid.length === 1 ? '' : 's'} selected${imageCount ? '. Images are preview-only and are not sent to StudyAI.' : ''}`)

    onFilesSelected?.(valid)
    setOpen(false)
    event.target.value = ''
  }

  async function extractText(file) {
    if (/\.pdf$/i.test(file.name)) {
      const pdf = await pdfjsLib.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
      }).promise
      let text = ''

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber)
        const content = await page.getTextContent()
        const pageText = content.items
          .map(item => ('str' in item ? item.str : ''))
          .join(' ')
        text += `\nPage ${pageNumber}\n${pageText}`
        if (text.length >= MAX_TEXTBOOK_LENGTH) break
      }

      if (!text.trim()) {
        throw new Error(`${file.name} has no selectable text. Scanned PDFs are not supported yet.`)
      }

      return `Document: ${file.name}\n${text}`
    }

    return `Document: ${file.name}\n${await file.text()}`
  }

  async function sendMessage(event) {
    event.preventDefault()
    if (sending || (!question.trim() && sendableFiles.length === 0)) return

    onChatStart?.()
    setSending(true)
    setChatError('')

    try {
      const attachedFiles = [...sendableFiles]
      const extractedDocuments = await Promise.all(attachedFiles.map(extractText))
      const textbookText = extractedDocuments.join('\n\n').slice(0, MAX_TEXTBOOK_LENGTH)
      const prompt = question.trim() || 'Please summarize this document and explain its key ideas.'
      const userMessage = {
        role: 'user',
        content: prompt,
        files: attachedFiles.map(file => file.name),
      }

      const response = await fetch('/api/tutor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          question: prompt,
          textbookText,
          history: messages.slice(-8).map(({ role, content }) => ({ role, content })),
        }),
      })
      if (response.ok || response.status === 429 || response.status >= 500) {
        onUsageChange?.()
      }
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || `The tutor request failed (${response.status}).`)
      }
      if (typeof data.answer !== 'string' || !data.answer.trim()) {
        throw new Error('The AI returned an empty response. Please try again.')
      }

      const nextMessages = [
        ...messages,
        userMessage,
        { role: 'assistant', content: data.answer },
      ]
      setMessages(nextMessages)
      onMessagesChange?.(nextMessages)
      setQuestion('')
      setSelectedFiles(currentFiles => currentFiles.filter(isImageFile))
    } catch (error) {
      setChatError(error.message || 'Could not reach the AI tutor. Check that the backend is running.')
    } finally {
      setSending(false)
    }
  }

  async function copyMessage(content, index) {
    try {
      await navigator.clipboard.writeText(content)
      setChatError('')
      setCopiedMessageIndex(index)
    } catch {
      setChatError('Could not copy this message. Check your browser permissions and try again.')
    }
  }

  async function shareMessage(content, index) {
    if (typeof navigator.share !== 'function') {
      await copyMessage(content, index)
      return
    }

    try {
      await navigator.share({ title: 'StudyAI message', text: content })
      setChatError('')
    } catch (error) {
      if (error.name !== 'AbortError') {
        setChatError('Could not share this message. Please try again.')
      }
    }
  }

  function startFollowUp(prompt) {
    setQuestion(prompt)
    setChatError('')
    questionInput.current?.focus()
  }

  function connect(service) {
    if (onConnect) {
      onConnect(service)
    } else {
      setNotice(`${service} integration is not connected yet.`)
    }
  }

  function selectDocument(doc) {
    onSelectDocument?.(doc)
    setNotice(`Selected ${typeof doc === 'string' ? doc : doc.name}`)
    setOpen(false)
  }

  return (
    <div className="file-menu-wrap">
      {open && createPortal((
        <>
          <button
            className="file-menu-backdrop"
            aria-label="Close file menu"
            onClick={() => setOpen(false)}
          />

          <section
            ref={menuElement}
            className="file-action-menu"
            aria-label="File and document actions"
            style={menuPosition || undefined}
          >
            <div className="file-menu-status">
              <div className="status-left">
                <span className="status-dot" />
                <span>{remainingUploads} of {dailyUploadLimit} daily uploads remaining</span>
              </div>
              <button
                className="icon-button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <div className="file-menu-heading">
              <div>
                <h3>Add to your study session</h3>
                <p>Upload a file or choose an existing document.</p>
              </div>
            </div>

            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept=".pdf,.txt,.md,.jpg,.jpeg,.png,.webp,.gif,application/pdf,text/plain,text/markdown,image/jpeg,image/png,image/webp,image/gif"
              multiple
              onChange={handleFiles}
            />

            <button
              className="file-action-option primary-option"
              onClick={() => fileInput.current?.click()}
            >
              <span className="option-icon"><Icon name="paperclip" /></span>
              <span className="option-copy">
                <strong>Upload PDF, text or image</strong>
                <small>PDF, TXT, Markdown or image · up to 20 MB</small>
              </span>
              <Icon name="chevron" size={16} />
            </button>

            <button
              className="file-action-option"
              onClick={() => {
                setSearch('')
                document.getElementById('document-library-search')?.focus()
              }}
            >
              <span className="option-icon"><Icon name="folder" /></span>
              <span className="option-copy">
                <strong>Add from cloud / library</strong>
                <small>Find previously uploaded documents</small>
              </span>
              <Icon name="chevron" size={16} />
            </button>

            {selectedFiles.length > 0 && (
              <div className="selected-file-list">
                {selectedFiles.map((file, index) => (
                  <div className="selected-file" key={`${file.name}-${index}`}>
                    {isImageFile(file) && imagePreviewUrlMap.has(file)
                      ? <img className="file-image-preview" src={imagePreviewUrlMap.get(file)} alt={`Preview of ${file.name}`} />
                      : <Icon name="file" size={16} />}
                    <span>{file.name}</span>
                    <span className="file-size">
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="file-menu-divider" />

            <div className="connector-heading">CLOUD STORAGE</div>

            <div className="connector-list">
              <div className="connector-row">
                <span className="connector-icon drive-icon">
                  <Icon name="drive" size={17} />
                </span>
                <span className="connector-name">Google Drive</span>
                <button className="connect-button" onClick={() => connect('Google Drive')}>
                  Connect
                </button>
              </div>

              <div className="connector-row">
                <span className="connector-icon">
                  <Icon name="cloud" size={17} />
                </span>
                <span className="connector-name">OneDrive</span>
                <button className="connect-button" onClick={() => connect('OneDrive')}>
                  Connect
                </button>
              </div>

              <div className="connector-row">
                <span className="connector-icon">
                  <Icon name="folder" size={17} />
                </span>
                <span className="connector-name">Dropbox</span>
                <button className="connect-button" onClick={() => connect('Dropbox')}>
                  Connect
                </button>
              </div>
            </div>

            <div className="file-menu-divider" />

            <label className="document-search">
              <Icon name="search" size={17} />
              <input
                id="document-library-search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search uploaded documents..."
              />
              {search && (
                <button
                  className="search-clear"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  type="button"
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </label>

            {(search || documents.length > 0) && (
              <div className="document-results">
                {filteredDocuments.length ? (
                  filteredDocuments.slice(0, 5).map(doc => (
                    <button
                      className="document-result"
                      key={typeof doc === 'string' ? doc : doc.id || doc.name}
                      onClick={() => selectDocument(doc)}
                    >
                      <Icon name="file" size={16} />
                      <span>{typeof doc === 'string' ? doc : doc.name}</span>
                    </button>
                  ))
                ) : (
                  <p className="empty-results">No matching documents found.</p>
                )}
              </div>
            )}

            <div className="file-menu-footer">
              <span>{notice || 'Your documents stay private.'}</span>
              <span>StudyAI</span>
            </div>
          </section>
        </>
      ), document.body)}

      {messages.length > 0 && (
        <div className="chat-messages" role="log" aria-live="polite" aria-label="StudyAI conversation">
          {messages.map((message, index) => (
            <article className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
              {message.files?.length > 0 && (
                <div className="chat-message-files">
                  {message.files.map(fileName => (
                    <span className="chat-message-file" key={fileName}>
                      <Icon name="file" size={13} />
                      {fileName}
                    </span>
                  ))}
                </div>
              )}
              {message.role === 'assistant' ? (
                <>
                  <section className="assistant-output-card" aria-label="Assistant message">
                    <header className="assistant-output-header">
                      <span className="assistant-output-label">
                        <Icon name="file" size={17} />
                        Message
                      </span>
                      <div className="assistant-output-actions">
                        <button
                          className="assistant-output-action"
                          type="button"
                          onClick={() => copyMessage(message.content, index)}
                          aria-label={copiedMessageIndex === index ? 'Copied to clipboard' : 'Copy message'}
                          title={copiedMessageIndex === index ? 'Copied' : 'Copy'}
                        >
                          <Icon name={copiedMessageIndex === index ? 'check' : 'copy'} size={17} />
                        </button>
                        <button
                          className="assistant-output-action"
                          type="button"
                          onClick={() => shareMessage(message.content, index)}
                          aria-label="Share message"
                          title="Share"
                        >
                          <Icon name="send" size={17} />
                        </button>
                      </div>
                    </header>
                    <div className="assistant-output-content">{message.content}</div>
                  </section>
                  <div className="assistant-follow-ups" role="group" aria-label="Suggested follow-up questions">
                    {FOLLOW_UP_SUGGESTIONS.map(suggestion => (
                      <button
                        className="assistant-follow-up"
                        key={suggestion.label}
                        type="button"
                        onClick={() => startFollowUp(suggestion.prompt)}
                      >
                        <Icon name="reply" size={16} />
                        {suggestion.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p>{message.content}</p>
              )}
            </article>
          ))}
        </div>
      )}

      <form className="file-composer" onSubmit={sendMessage}>
        {selectedFiles.length > 0 && (
          <div className="composer-attachments" aria-label="Attached files">
            {selectedFiles.map((file, index) => (
              <div className="composer-file" key={`${file.name}-${index}`}>
                {isImageFile(file) && imagePreviewUrlMap.has(file)
                  ? <img className="file-image-preview" src={imagePreviewUrlMap.get(file)} alt={`Preview of ${file.name}`} />
                  : <Icon name="file" size={15} />}
                <span className="composer-file-name" title={file.name}>{file.name}</span>
                <button
                  className="composer-file-remove"
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  disabled={sending}
                  onClick={() => {
                    const imageUrl = imagePreviewUrls.current.get(file)
                    if (imageUrl) {
                      URL.revokeObjectURL(imageUrl)
                      imagePreviewUrls.current.delete(file)
                      setImagePreviews(current => current.filter(preview => preview.file !== file))
                    }
                    setSelectedFiles(currentFiles =>
                      currentFiles.filter((_, fileIndex) => fileIndex !== index)
                    )
                  }}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        {imagePreviews.length > 0 && (
          <p className="composer-image-note">Images are preview-only and are not sent to StudyAI.</p>
        )}

        <div className="composer-controls">
          <button
            ref={attachButton}
            className={`composer-attach ${open ? 'is-active' : ''}`}
            type="button"
            onClick={() => setOpen(value => !value)}
            aria-expanded={open}
            aria-label="Open file and document menu"
            disabled={sending}
          >
            <Icon name={open ? 'close' : 'paperclip'} size={19} />
          </button>
          <input
            ref={questionInput}
            className="composer-input"
            value={question}
            onChange={event => setQuestion(event.target.value)}
            placeholder="Ask StudyAI about your textbook..."
            aria-label="Ask StudyAI"
            disabled={sending}
          />
          <span className="composer-hint">Attach a file</span>
          <button
            className="composer-send"
            type="submit"
            aria-label={sending ? 'StudyAI is responding' : tutorRemaining === 0 ? 'Daily AI Tutor limit reached' : 'Send message'}
            title={sending ? 'StudyAI is responding' : tutorRemaining === 0 ? 'Daily AI Tutor limit reached' : 'Send message'}
            disabled={sending || tutorRemaining === 0 || (!question.trim() && sendableFiles.length === 0)}
          >
            <Icon name="send" size={17} />
          </button>
        </div>
        {sending && <p className="composer-status">StudyAI is thinking...</p>}
        {tutorRemaining === 0 && (
          <p className="composer-limit-message" role="status">
            You’ve used today’s AI Tutor allowance. It resets at UTC midnight.
          </p>
        )}
      </form>
      {chatError && <p className="chat-error" role="alert">{chatError}</p>}
    </div>
  )
}
