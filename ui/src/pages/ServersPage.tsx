import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createServer, listServers } from '../lib/api'
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

  useEffect(() => {
    const controller = new AbortController()

    void (async () => {
      try {
        const payload = await listServers(controller.signal)
        setServers(payload.servers)
        setLoadError('')
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }
        setLoadError(error instanceof Error ? error.message : 'unable to load servers')
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
      setCreateServerError(
        error instanceof Error ? error.message : 'unable to create the server',
      )
    } finally {
      setIsCreatingServer(false)
    }
  }

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2 className="section-title">Servers</h2>
          <p className="section-copy">
            Add MCP endpoints, inspect them on the backend, and open only sanitized tool
            and resource details in the dashboard.
          </p>
        </div>

        <button className="primary-button" type="button" onClick={() => setIsModalOpen(true)}>
          Add Server
        </button>
      </section>

      {loadError ? <p className="error-banner">{loadError}</p> : null}

      {isLoading ? (
        <section className="card empty-state">
          <h3>Loading servers</h3>
          <p>Fetching backend-managed server summaries.</p>
        </section>
      ) : sortedServers.length === 0 ? (
        <section className="card empty-state">
          <h3>No servers yet</h3>
          <p>Add your first MCP server to start inspecting tools and metadata.</p>
          <button className="primary-button" type="button" onClick={() => setIsModalOpen(true)}>
            Add Server
          </button>
        </section>
      ) : (
        <section className="server-grid">
          {sortedServers.map((server) => (
            <ServerCard key={server.id} server={server} />
          ))}
        </section>
      )}

      {isModalOpen ? (
        <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="add-server-title">
          <button
            className="modal-backdrop"
            type="button"
            aria-label="Close add server dialog"
            onClick={() => setIsModalOpen(false)}
          />

          <section className="modal-card">
            <div className="section-heading">
              <div>
                <h3 id="add-server-title">Add Server</h3>
                <p>Send credentials once, store them server-side, and inspect immediately.</p>
              </div>
            </div>

            <form className="dashboard-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <label className="field">
                  <span>Display name</span>
                  <input
                    type="text"
                    value={draftServer.name}
                    onChange={(event) =>
                      setDraftServer((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Production MCP"
                  />
                </label>

                <label className="field field-span-2">
                  <span>Endpoint</span>
                  <input
                    type="url"
                    value={draftServer.endpoint}
                    onChange={(event) =>
                      setDraftServer((current) => ({
                        ...current,
                        endpoint: event.target.value,
                      }))
                    }
                    placeholder="https://example.com/mcp"
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
                  <label className="field field-span-2">
                    <span>Bearer token</span>
                    <input
                      type="password"
                      value={draftServer.bearerToken}
                      onChange={(event) =>
                        setDraftServer((current) => ({
                          ...current,
                          bearerToken: event.target.value,
                        }))
                      }
                      placeholder="sk-..."
                    />
                  </label>
                ) : null}

                {draftServer.authType === 'header' ? (
                  <>
                    <label className="field">
                      <span>Header name</span>
                      <input
                        type="text"
                        value={draftServer.headerName}
                        onChange={(event) =>
                          setDraftServer((current) => ({
                            ...current,
                            headerName: event.target.value,
                          }))
                        }
                        placeholder="X-API-Key"
                      />
                    </label>

                    <label className="field field-span-2">
                      <span>Header value</span>
                      <input
                        type="password"
                        value={draftServer.headerValue}
                        onChange={(event) =>
                          setDraftServer((current) => ({
                            ...current,
                            headerValue: event.target.value,
                          }))
                        }
                        placeholder="secret value"
                      />
                    </label>
                  </>
                ) : null}
              </div>

              {createServerError ? <p className="error-banner">{createServerError}</p> : null}

              <div className="form-actions">
                <button className="primary-button" type="submit" disabled={isCreatingServer}>
                  {isCreatingServer ? 'Saving...' : 'Save and inspect'}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function ServerCard({ server }: { server: ServerSummary }) {
  return (
    <Link className="card server-card" to={`/servers/${server.id}`}>
      <div className="server-card-header">
        <div>
          <h3>{server.name}</h3>
          <p className="server-card-endpoint">{server.endpoint}</p>
        </div>
        <span className={`status-badge status-${server.status}`}>{statusLabel(server.status)}</span>
      </div>

      <div className="server-card-metrics">
        <div>
          <span className="summary-label">Tools</span>
          <strong>{server.toolCount}</strong>
        </div>
        <div>
          <span className="summary-label">Resources</span>
          <strong>{server.resourceCount}</strong>
        </div>
        <div>
          <span className="summary-label">Transport</span>
          <strong>{server.transport || 'Unknown'}</strong>
        </div>
      </div>

      <div className="server-card-footer">
        <span>{server.lastInspectedAt ? `Inspected ${formatRelative(server.lastInspectedAt)}` : 'Not inspected yet'}</span>
        <span className="server-card-link">Open</span>
      </div>
    </Link>
  )
}

function statusLabel(status: ServerStatus) {
  switch (status) {
    case 'ready':
      return 'Ready'
    case 'pending':
      return 'Inspecting'
    default:
      return 'Needs attention'
  }
}

function formatRelative(timestamp: string) {
  const delta = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.max(1, Math.round(delta / 60000))

  if (minutes < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.round(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }

  const days = Math.round(hours / 24)
  return `${days}d ago`
}
