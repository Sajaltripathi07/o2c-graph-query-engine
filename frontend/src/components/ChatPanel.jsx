import { useState, useRef, useEffect } from 'react'
import SimpleMarkdown from './SimpleMarkdown.jsx'
import './ChatPanel.css'

const SUGGESTED_QUERIES = [
  'Which products are associated with the highest number of billing documents?',
  'Trace the full flow of billing document 90504274',
  'Which sales orders have been delivered but not billed?',
  'Show me the top 5 customers by total order value',
  'Which billing documents are cancelled?',
  'What is the total payment amount by customer?',
]

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-avatar">{isUser ? '👤' : '⬡'}</div>
      <div className="message-body">
        <div className="message-content">
          <SimpleMarkdown>{msg.content}</SimpleMarkdown>
        </div>
        {msg.sql && (
          <details className="sql-block">
            <summary>View generated SQL</summary>
            <pre><code>{msg.sql}</code></pre>
          </details>
        )}
        {msg.outOfScope && (
          <div className="out-of-scope-badge">⚠ Out of scope</div>
        )}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="message assistant">
      <div className="message-avatar">⬡</div>
      <div className="message-body">
        <div className="typing-indicator">
          <span /><span /><span />
        </div>
      </div>
    </div>
  )
}

export default function ChatPanel({ apiUrl, onHighlightNodes }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `**Welcome to O2C Graph Intelligence**\n\nI can answer questions about your SAP Order-to-Cash data — sales orders, deliveries, billing documents, payments, customers, and products.\n\nTry one of the suggested queries below or ask anything about the dataset.`,
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(query) {
    if (!query.trim() || loading) return
    setShowSuggestions(false)

    const userMsg = { role: 'user', content: query }
    const history = messages.map(m => ({ role: m.role, content: m.content }))

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, history })
      })
      const data = await res.json()

      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }])
        return
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer,
        sql: data.sql,
        rows: data.rows,
        outOfScope: data.outOfScope,
      }])

      if (data.rows && data.rows.length > 0 && onHighlightNodes) {
        onHighlightNodes(extractNodeIds(data.rows))
      }
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Request failed: ${e.message}. Make sure the backend is running on port 3001.`
      }])
    } finally {
      setLoading(false)
    }
  }

  function extractNodeIds(rows) {
    const ids = []
    for (const row of rows.slice(0, 10)) {
      for (const [k, v] of Object.entries(row)) {
        if (!v) continue
        const val = String(v)
        if (k === 'billingDocument') ids.push(`bd_${val}`)
        else if (k === 'salesOrder') ids.push(`so_${val}`)
        else if (k === 'businessPartner' || k === 'soldToParty' || k === 'customer') ids.push(`bp_${val}`)
        else if (k === 'deliveryDocument') ids.push(`del_${val}`)
        else if (k === 'plant') ids.push(`plant_${val}`)
        else if (k === 'product' || k === 'material') ids.push(`prod_${val}`)
      }
    }
    return [...new Set(ids)]
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-title">
          <span className="chat-title-icon">💬</span>
          <span>Query Interface</span>
        </div>
        <button className="clear-btn" onClick={() => { setMessages([{ role: 'assistant', content: 'Chat cleared. Ask me anything about the O2C dataset!' }]); setShowSuggestions(true) }}>✕ Clear</button>
      </div>

      <div className="messages-area">
        {messages.map((m, i) => <Message key={i} msg={m} />)}
        {loading && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {showSuggestions && (
        <div className="suggestions">
          <p className="suggestions-label">Try asking:</p>
          <div className="suggestions-grid">
            {SUGGESTED_QUERIES.slice(0, 4).map((q, i) => (
              <button key={i} className="suggestion-chip" onClick={() => sendMessage(q)}>{q}</button>
            ))}
          </div>
        </div>
      )}

      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about orders, deliveries, billing, payments…"
          rows={2}
          disabled={loading}
        />
        <button className="send-btn" onClick={() => sendMessage(input)} disabled={loading || !input.trim()}>
          {loading ? '…' : '↑'}
        </button>
      </div>
    </div>
  )
}
