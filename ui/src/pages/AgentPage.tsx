import clsx from 'clsx'
import { Bot, Plus, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { listServers } from '../lib/api'

const CURRENT_CHAT_STORAGE_KEY = 'mcp-inspector.agent.current-chat'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  activity?: string[]
}

type StoredCurrentChat = {
  messages: ChatMessage[]
  input: string
  sessionId: string
}

export function AgentPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadStoredCurrentChat().messages)
  const [input, setInput] = useState(() => loadStoredCurrentChat().input)
  const [sessionId, setSessionId] = useState(() => loadStoredCurrentChat().sessionId)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const [readyServerCount, setReadyServerCount] = useState(0)
  const assistantMessageIdRef = useRef('')

  useEffect(() => {
    const lastAssistantMessage = [...messages].reverse().find((message) => message.role === 'assistant')
    assistantMessageIdRef.current = lastAssistantMessage?.id ?? ''
  }, [messages])

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const payload = await listServers(controller.signal)
        setReadyServerCount(payload.servers.filter((server) => server.status === 'ready').length)
      } catch {
        if (!controller.signal.aborted) setReadyServerCount(0)
      }
    })()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!messages.length && !input && !sessionId) {
      window.localStorage.removeItem(CURRENT_CHAT_STORAGE_KEY)
      return
    }

    const payload: StoredCurrentChat = { messages, input, sessionId }
    window.localStorage.setItem(CURRENT_CHAT_STORAGE_KEY, JSON.stringify(payload))
  }, [input, messages, sessionId])

  async function handleSend() {
    const message = input.trim()
    if (!message || isSending || readyServerCount === 0) return

    const assistantId = crypto.randomUUID()
    assistantMessageIdRef.current = assistantId
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', content: message },
      { id: assistantId, role: 'assistant', content: '', activity: ['Thinking…'] },
    ])
    setInput('')
    setError('')
    setIsSending(true)

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message }),
      })

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => ({ error: 'agent request failed' }))) as { error?: string }
        throw new Error(payload.error || 'agent request failed')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''
        for (const rawEvent of events) applyEvent(rawEvent)
      }
    } catch (streamError) {
      const messageText = streamError instanceof Error ? streamError.message : 'agent request failed'
      setError(messageText)
      setMessages((current) =>
        current.map((entry) =>
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
        if (payload.sessionId) setSessionId(payload.sessionId)
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
        setMessages((current) =>
          current.map((entry) =>
            entry.id === assistantMessageIdRef.current
              ? { ...entry, content: payload.content || '' }
              : entry,
          ),
        )
        break
      case 'error':
        setError(payload.error || 'agent request failed')
        appendActivity(payload.error || 'agent request failed')
        break
    }
  }

  function appendActivity(message: string) {
    if (!message) return
    setMessages((current) =>
      current.map((entry) =>
        entry.id === assistantMessageIdRef.current
          ? { ...entry, activity: [...(entry.activity ?? []), message] }
          : entry,
      ),
    )
  }

  function resetCurrentChat() {
    setMessages([])
    setInput('')
    setSessionId('')
    setError('')
    assistantMessageIdRef.current = ''
    window.localStorage.removeItem(CURRENT_CHAT_STORAGE_KEY)
  }

  return (
    <div className="page-container page-stack-md agent-page">
      <div className="agent-page-top">
        <div className="page-header agent-page-header">
          <div>
            <h1 className="page-title">Agent</h1>
            <p className="page-subtitle">
              Chat with the server-side OpenAI agent using all ready MCP servers in this workspace.
            </p>
          </div>
          <button
            className="primary-action"
            type="button"
            onClick={resetCurrentChat}
          >
            <Plus className="button-icon" />
            New chat
          </button>
        </div>

        {error ? <div className="alert-error">{error}</div> : null}
      </div>

      <div className="agent-layout">
        <section className="panel-card agent-chat-panel">
          <div className="agent-chat-scroll">
            {messages.length > 0 ? (
              <div className="chat-stack">
                {messages.map((message) => (
                  <article key={message.id} className={clsx('chat-bubble', `chat-bubble-${message.role}`)}>
                    <div className="chat-role">{message.role === 'user' ? 'You' : 'Agent'}</div>
                    {message.role === 'assistant' ? (
                      <div className="chat-copy chat-copy-markdown">
                        <ReactMarkdown>{message.content || 'Working…'}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="chat-copy">{message.content}</p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="agent-chat-placeholder">
                <Bot className="empty-icon" />
                <p className="panel-copy">
                  {readyServerCount > 0
                    ? 'Ask the agent to use the connected MCP servers.'
                    : 'Add and inspect at least one server before using the agent.'}
                </p>
              </div>
            )}
          </div>

          <div className="agent-chat-composer">
            <label className="field">
              <span>Message</span>
              <textarea
                rows={5}
                value={input}
                placeholder="Ask the agent to use the connected MCP tools..."
                onChange={(event) => setInput(event.target.value)}
              />
            </label>
            <div className="composer-footer">
              <span className="composer-copy">
                {readyServerCount > 0
                  ? `${readyServerCount} ready server${readyServerCount === 1 ? '' : 's'} connected`
                  : 'No ready servers connected'}
              </span>
              <button className="primary-action" type="button" disabled={readyServerCount === 0 || isSending} onClick={() => void handleSend()}>
                <Send className="button-icon" />
                {isSending ? 'Streaming...' : 'Send'}
              </button>
            </div>
          </div>
        </section>

        <aside className="panel-card agent-aside">
          <h3 className="section-title">Live activity</h3>
          {messages.some((message) => message.activity?.length) ? (
            <div className="activity-stream">
              {messages.flatMap((message) =>
                (message.activity ?? []).slice(-4).map((entry, index) => (
                  <div key={`${message.id}-${index}`} className="activity-row">
                    <span className="activity-dot" />
                    <span>{entry}</span>
                  </div>
                )),
              )}
            </div>
          ) : (
            <p className="panel-copy">Run a prompt to see streaming tool activity.</p>
          )}
        </aside>
      </div>
    </div>
  )
}

function loadStoredCurrentChat(): StoredCurrentChat {
  const emptyState: StoredCurrentChat = { messages: [], input: '', sessionId: '' }
  const rawValue = window.localStorage.getItem(CURRENT_CHAT_STORAGE_KEY)
  if (!rawValue) return emptyState

  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredCurrentChat>
    return {
      messages: Array.isArray(parsed.messages)
        ? parsed.messages.filter(isStoredChatMessage)
        : [],
      input: typeof parsed.input === 'string' ? parsed.input : '',
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : '',
    }
  } catch {
    window.localStorage.removeItem(CURRENT_CHAT_STORAGE_KEY)
    return emptyState
  }
}

function isStoredChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    (candidate.role === 'user' || candidate.role === 'assistant') &&
    typeof candidate.content === 'string' &&
    (candidate.activity === undefined ||
      (Array.isArray(candidate.activity) &&
        candidate.activity.every((entry) => typeof entry === 'string')))
  )
}
