import { useMemo, useRef, useState } from 'react'
import { useAppState } from '../state/useAppState'
import type { ServerRecord } from '../types'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  activity?: string[]
}

export function AgentPage() {
  const { servers } = useAppState()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const assistantMessageIdRef = useRef('')

  const readyServers = useMemo(
    () => servers.filter((server) => server.inspectResult && server.status === 'ready'),
    [servers],
  )

  async function handleSend() {
    const message = input.trim()
    if (message === '' || isSending || readyServers.length === 0) {
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
          servers: readyServers.map(serializeServerForAgent),
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
      <section className="page-intro">
        <div>
          <h2 className="section-title">Agent</h2>
          <p className="section-copy">Chat with a server-side OpenAI agent that can use tools from all ready MCP servers in this workspace.</p>
        </div>
      </section>

      <section className="summary-grid">
        <article className="card summary-card">
          <span className="summary-label">Connected servers</span>
          <strong>{readyServers.length}</strong>
          <p>Only ready servers are included in the agent toolset.</p>
        </article>
        <article className="card summary-card">
          <span className="summary-label">Conversation</span>
          <strong>{messages.filter((entry) => entry.role === 'user').length}</strong>
          <p>Server-side context is retained for this active chat session.</p>
        </article>
        <article className="card summary-card">
          <span className="summary-label">Session</span>
          <strong>{sessionId ? sessionId.slice(0, 8) : 'New'}</strong>
          <p>Use “New chat” to reset the conversation and start fresh.</p>
        </article>
      </section>

      <section className="content-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h3>Available servers</h3>
              <p>These inspected servers are available to the agent right now.</p>
            </div>
          </div>

          {readyServers.length > 0 ? (
            <div className="tool-preview-list">
              {readyServers.map((server) => (
                <div key={server.id} className="tool-preview-row">
                  <div>
                    <strong>{server.name}</strong>
                    <p className="tool-preview-description">{server.endpoint}</p>
                  </div>
                  <div className="tool-preview-meta">
                    <span>{server.inspectResult?.tools.length ?? 0} tools</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>No ready servers</h3>
              <p>Add and inspect at least one server before using the agent.</p>
            </div>
          )}
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h3>Chat</h3>
              <p>Streaming updates arrive over HTTP from the backend agent session.</p>
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
                <p>Ask the agent to explore, compare, or operate across the connected MCP servers.</p>
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
                disabled={isSending || readyServers.length === 0}
                onClick={() => void handleSend()}
              >
                {isSending ? 'Streaming...' : 'Send'}
              </button>
            </div>
          </div>
        </article>
      </section>
    </div>
  )
}

function serializeServerForAgent(server: ServerRecord) {
  return {
    id: server.id,
    name: server.name,
    endpoint: server.endpoint,
    authType: server.authType,
    bearerToken: server.bearerToken,
    headerName: server.headerName,
    headerValue: server.headerValue,
    inspectResult: server.inspectResult,
  }
}
