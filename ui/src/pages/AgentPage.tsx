import { useEffect, useRef, useState } from 'react'
import { listServers } from '../lib/api'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  activity?: string[]
}

export function AgentPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const [readyServerCount, setReadyServerCount] = useState(0)
  const assistantMessageIdRef = useRef('')

  useEffect(() => {
    const controller = new AbortController()

    void (async () => {
      try {
        const payload = await listServers(controller.signal)
        setReadyServerCount(payload.servers.filter((server) => server.status === 'ready').length)
      } catch {
        if (!controller.signal.aborted) {
          setReadyServerCount(0)
        }
      }
    })()

    return () => controller.abort()
  }, [])

  async function handleSend() {
    const message = input.trim()
    if (message === '' || isSending || readyServerCount === 0) {
      return
    }

    const assistantId = crypto.randomUUID()
    assistantMessageIdRef.current = assistantId
    setMessages((currentMessages) => [
      ...currentMessages,
      { id: crypto.randomUUID(), role: 'user', content: message },
      { id: assistantId, role: 'assistant', content: '', activity: ['Thinking…'] },
    ])
    setInput('')
    setError('')
    setIsSending(true)

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          message,
        }),
      })

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => ({ error: 'agent request failed' }))) as {
          error?: string
        }
        throw new Error(payload.error || 'agent request failed')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const rawEvent of events) {
          applyEvent(rawEvent)
        }
      }
    } catch (streamError) {
      const messageText =
        streamError instanceof Error ? streamError.message : 'agent request failed'
      setError(messageText)
      setMessages((currentMessages) =>
        currentMessages.map((entry) =>
          entry.id === assistantId
            ? {
                ...entry,
                content: entry.content || 'Unable to complete the request.',
                activity: [...(entry.activity ?? []), messageText],
              }
            : entry,
        ),
      )
    } finally {
      setIsSending(false)
    }
  }

  function applyEvent(rawEvent: string) {
    const lines = rawEvent.split('\n')
    const event = lines.find((line) => line.startsWith('event: '))?.slice(7) ?? 'message'
    const dataLine = lines.find((line) => line.startsWith('data: '))?.slice(6) ?? '{}'
    const payload = JSON.parse(dataLine) as Record<string, string>

    switch (event) {
      case 'session':
        if (payload.sessionId) {
          setSessionId(payload.sessionId)
        }
        break
      case 'status':
        appendActivity(payload.message)
        break
      case 'tool_call':
        appendActivity(`Using ${payload.server}: ${payload.tool}`)
        break
      case 'tool_result':
        appendActivity(`Result from ${payload.server}: ${payload.result}`)
        break
      case 'final':
        setMessages((currentMessages) =>
          currentMessages.map((entry) =>
            entry.id === assistantMessageIdRef.current
              ? {
                  ...entry,
                  content: payload.content || '',
                }
              : entry,
          ),
        )
        break
      case 'error':
        setError(payload.error || 'agent request failed')
        appendActivity(payload.error || 'agent request failed')
        break
      default:
        break
    }
  }

  function appendActivity(message: string) {
    if (!message) {
      return
    }

    setMessages((currentMessages) =>
      currentMessages.map((entry) =>
        entry.id === assistantMessageIdRef.current
          ? {
              ...entry,
              activity: [...(entry.activity ?? []), message],
            }
          : entry,
      ),
    )
  }

  return (
    <div className="page-stack">
      <section className="card agent-chat-card">
        <div className="section-heading">
          <div>
            <h2 className="section-title">Agent</h2>
            <p className="section-copy">Chat with a server-side OpenAI agent that can use tools from all ready MCP servers in this workspace.</p>
          </div>

          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setMessages([])
              setSessionId('')
              setError('')
            }}
          >
            New chat
          </button>
        </div>

        <div className="chat-log">
          {messages.length > 0 ? (
            messages.map((message) => (
              <article
                key={message.id}
                className={`chat-bubble chat-bubble-${message.role}`}
              >
                <header>
                  <strong>{message.role === 'user' ? 'You' : 'Agent'}</strong>
                </header>
                <p>{message.content || 'Working…'}</p>
                {message.activity && message.activity.length > 0 ? (
                  <div className="chat-activity">
                    {message.activity.slice(-4).map((entry, index) => (
                      <p key={`${message.id}-${index}`}>{entry}</p>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="empty-state">
              <h3>Start a conversation</h3>
              <p>
                {readyServerCount > 0
                  ? 'Ask the agent to explore, compare, or operate across the connected MCP servers.'
                  : 'Add and inspect at least one server before using the agent.'}
              </p>
            </div>
          )}
        </div>

        <div className="dashboard-form">
          <label className="field">
            <span>Message</span>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask the agent to use the connected MCP tools..."
              rows={4}
            />
          </label>

          {error ? <p className="error-banner">{error}</p> : null}

          <div className="form-actions">
            <button
              className="primary-button"
              type="button"
              disabled={isSending || readyServerCount === 0}
              onClick={() => void handleSend()}
            >
              {isSending ? 'Streaming...' : 'Send'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
