import clsx from 'clsx'
import {
  Activity,
  AlertTriangle,
  Database,
  Plus,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createServer, deleteServer, listServers } from '../lib/api'
import type { CreateServerFormState, ServerStatus, ServerSummary } from '../types'

const initialDraftServer: CreateServerFormState = {
  name: '',
  endpoint: 'http://localhost:8000',
  authType: 'none',
  bearerToken: '',
  headerName: '',
  headerValue: '',
}

export function ServersPage() {
  const navigate = useNavigate()
  const [servers, setServers] = useState<ServerSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [draftServer, setDraftServer] = useState<CreateServerFormState>(initialDraftServer)
  const [isCreatingServer, setIsCreatingServer] = useState(false)
  const [createServerError, setCreateServerError] = useState('')
  const [deletingServerId, setDeletingServerId] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    void (async () => {
      try {
        const payload = await listServers(controller.signal)
        setServers(payload.servers)
        setLoadError('')
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load servers')
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    })()

    return () => controller.abort()
  }, [])

  const sortedServers = useMemo(
    () =>
      [...servers].sort((left, right) =>
        (right.lastInspectedAt || '').localeCompare(left.lastInspectedAt || ''),
      ),
    [servers],
  )

  const metrics = useMemo(() => {
    const ready = servers.filter((server) => server.status === 'ready').length
    const issues = servers.filter((server) => server.status === 'error').length
    const tools = servers.reduce((count, server) => count + server.toolCount, 0)
    return { total: servers.length, ready, issues, tools }
  }, [servers])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsCreatingServer(true)
    setCreateServerError('')

    try {
      const server = await createServer(draftServer)
      setDraftServer(initialDraftServer)
      setIsModalOpen(false)
      navigate(`/servers/${server.id}`)
    } catch (error) {
      setCreateServerError(error instanceof Error ? error.message : 'Unable to create server')
    } finally {
      setIsCreatingServer(false)
    }
  }

  async function handleDelete(server: ServerSummary) {
    if (!window.confirm(`Remove ${server.name}?`)) {
      return
    }

    setDeletingServerId(server.id)
    try {
      await deleteServer(server.id)
      setServers((current) => current.filter((entry) => entry.id !== server.id))
      setLoadError('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to remove server')
    } finally {
      setDeletingServerId('')
    }
  }

  return (
    <div className="page-container page-stack-md servers-page">
      <div className="servers-page-top">
        <div className="page-header">
          <div>
            <h1 className="page-title">Servers</h1>
            <p className="page-subtitle">
              Add MCP endpoints, inspect them on the backend, and drill into tools or resources from a
              single workspace.
            </p>
          </div>
          <button className="primary-action" type="button" onClick={() => setIsModalOpen(true)}>
            <Plus className="button-icon" />
            Add Server
          </button>
        </div>

        <div className="stats-grid servers-stats-grid">
          <StatCard icon={Database} label="Total servers" value={String(metrics.total)} />
          <StatCard icon={ShieldCheck} label="Ready" value={String(metrics.ready)} tone="green" />
          <StatCard icon={AlertTriangle} label="Issues" value={String(metrics.issues)} tone="amber" />
          <StatCard icon={Wrench} label="Tools" value={String(metrics.tools)} tone="violet" />
        </div>

        {loadError ? <div className="alert-error">{loadError}</div> : null}
      </div>

      <div className="servers-page-content">
        {isLoading ? (
          <div className="loading-grid">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="loading-card" />
            ))}
          </div>
        ) : sortedServers.length === 0 ? (
          <div className="empty-card">
            <Database className="empty-icon" />
            <h3>No servers yet</h3>
            <p>Add your first MCP server to start inspecting tools and metadata.</p>
            <button className="primary-action" type="button" onClick={() => setIsModalOpen(true)}>
              <Plus className="button-icon" />
              Add Server
            </button>
          </div>
        ) : (
          <div className="server-card-grid">
            {sortedServers.map((server) => (
              <article key={server.id} className="panel-card server-card">
                <Link className="server-card-link server-card-link-compact" to={`/servers/${server.id}`}>
                  <div className="server-card-top">
                    <div>
                      <h3>{server.name}</h3>
                      <p className="server-endpoint">{server.endpoint}</p>
                    </div>
                    <span className={clsx('status-pill', `status-${server.status}`)}>
                      {statusLabel(server.status)}
                    </span>
                  </div>

                  <div className="server-badges">
                    <span className="soft-pill">{server.transport || 'Unknown transport'}</span>
                    <span className="soft-pill">{server.toolCount} tools</span>
                    <span className="soft-pill">{server.resourceCount} resources</span>
                  </div>

                  <div className="server-card-footer server-card-footer-compact">
                    <span className="server-card-copy">
                      {server.lastInspectedAt ? `Inspected ${formatRelative(server.lastInspectedAt)}` : 'Inspection pending'}
                    </span>
                    {server.lastError ? <span className="server-card-issue">{server.lastError}</span> : null}
                  </div>
                </Link>

                <button
                  className="danger-ghost server-card-remove"
                  type="button"
                  disabled={deletingServerId === server.id}
                  onClick={() => void handleDelete(server)}
                >
                  <Trash2 className="button-icon" />
                  {deletingServerId === server.id ? 'Removing...' : 'Remove'}
                </button>
              </article>
            ))}
          </div>
        )}
      </div>

      {isModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsModalOpen(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Add Server</h3>
                <p>Send credentials once, store them server-side, and inspect immediately.</p>
              </div>
            </div>

            <form className="form-stack" onSubmit={handleSubmit}>
              <label className="field">
                <span>Display name</span>
                <input
                  type="text"
                  value={draftServer.name}
                  placeholder="Production MCP"
                  onChange={(event) =>
                    setDraftServer((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>

              <label className="field">
                <span>Endpoint</span>
                <input
                  type="url"
                  value={draftServer.endpoint}
                  placeholder="https://example.com/mcp"
                  onChange={(event) =>
                    setDraftServer((current) => ({ ...current, endpoint: event.target.value }))
                  }
                />
              </label>

              <label className="field">
                <span>Authorization</span>
                <select
                  value={draftServer.authType}
                  onChange={(event) =>
                    setDraftServer((current) => ({
                      ...current,
                      authType: event.target.value as CreateServerFormState['authType'],
                    }))
                  }
                >
                  <option value="none">None</option>
                  <option value="bearer">Bearer token</option>
                  <option value="header">Custom header</option>
                </select>
              </label>

              {draftServer.authType === 'bearer' ? (
                <label className="field">
                  <span>Bearer token</span>
                  <input
                    type="password"
                    value={draftServer.bearerToken}
                    placeholder="sk-..."
                    onChange={(event) =>
                      setDraftServer((current) => ({ ...current, bearerToken: event.target.value }))
                    }
                  />
                </label>
              ) : null}

              {draftServer.authType === 'header' ? (
                <div className="field-grid">
                  <label className="field">
                    <span>Header name</span>
                    <input
                      type="text"
                      value={draftServer.headerName}
                      placeholder="X-API-Key"
                      onChange={(event) =>
                        setDraftServer((current) => ({ ...current, headerName: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Header value</span>
                    <input
                      type="password"
                      value={draftServer.headerValue}
                      placeholder="Secret value"
                      onChange={(event) =>
                        setDraftServer((current) => ({ ...current, headerValue: event.target.value }))
                      }
                    />
                  </label>
                </div>
              ) : null}

              {createServerError ? <div className="alert-error">{createServerError}</div> : null}

              <div className="modal-actions">
                <button className="secondary-action" type="button" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button className="primary-action" type="submit" disabled={isCreatingServer}>
                  <Plus className="button-icon" />
                  {isCreatingServer ? 'Saving...' : 'Save and inspect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'blue',
}: {
  icon: typeof Activity
  label: string
  value: string
  tone?: 'blue' | 'green' | 'amber' | 'violet'
}) {
  return (
    <div className="panel-card stat-card servers-stat-card">
      <div className={clsx('stat-icon', `stat-icon-${tone}`, 'servers-stat-icon')}>
        <Icon className="stat-icon-svg" />
      </div>
      <div className="servers-stat-copy">
        <p className="stat-label">{label}</p>
        <p className="stat-value servers-stat-value">{value}</p>
      </div>
    </div>
  )
}

function statusLabel(status: ServerStatus) {
  switch (status) {
    case 'ready':
      return 'Ready'
    case 'pending':
      return 'Inspecting'
    default:
      return 'Attention'
  }
}

function formatRelative(timestamp: string) {
  const delta = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.max(1, Math.round(delta / 60000))

  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
