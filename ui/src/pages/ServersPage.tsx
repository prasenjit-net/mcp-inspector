import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppState } from '../state/useAppState'
import type { ServerRecord, ServerStatus } from '../types'

export function ServersPage() {
  const navigate = useNavigate()
  const {
    servers,
    draftServer,
    updateDraftServer,
    createServer,
    createServerError,
    isCreatingServer,
  } = useAppState()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const sortedServers = useMemo(
    () => [...servers].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [servers],
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const serverId = await createServer()
    if (serverId) {
      setIsModalOpen(false)
      navigate(`/servers/${serverId}`)
    }
  }

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2 className="section-title">Servers</h2>
          <p className="section-copy">Add MCP endpoints, monitor inspection status, and drill into tools or resources from a single workspace.</p>
        </div>

        <button className="primary-button" type="button" onClick={() => setIsModalOpen(true)}>
          Add Server
        </button>
      </section>

      {sortedServers.length === 0 ? (
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
                <p>Save a server entry and inspect it immediately.</p>
              </div>
            </div>

            <form className="dashboard-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <label className="field">
                  <span>Display name</span>
                  <input
                    type="text"
                    value={draftServer.name}
                    onChange={(event) => updateDraftServer({ name: event.target.value })}
                    placeholder="Production MCP"
                  />
                </label>

                <label className="field field-span-2">
                  <span>Endpoint</span>
                  <input
                    type="url"
                    value={draftServer.serverURL}
                    onChange={(event) => updateDraftServer({ serverURL: event.target.value })}
                    placeholder="https://example.com/mcp"
                  />
                </label>

                <label className="field">
                  <span>Authorization</span>
                  <select
                    value={draftServer.authType}
                    onChange={(event) =>
                      updateDraftServer({
                        authType: event.target.value as typeof draftServer.authType,
                      })
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
                      onChange={(event) => updateDraftServer({ bearerToken: event.target.value })}
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
                        onChange={(event) => updateDraftServer({ headerName: event.target.value })}
                        placeholder="X-API-Key"
                      />
                    </label>

                    <label className="field field-span-2">
                      <span>Header value</span>
                      <input
                        type="password"
                        value={draftServer.headerValue}
                        onChange={(event) => updateDraftServer({ headerValue: event.target.value })}
                        placeholder="secret value"
                      />
                    </label>
                  </>
                ) : null}
              </div>

              {createServerError ? <p className="error-banner">{createServerError}</p> : null}

              <div className="form-actions">
                <button className="primary-button" type="submit" disabled={isCreatingServer}>
                  {isCreatingServer ? 'Inspecting...' : 'Save and inspect'}
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

function ServerCard({ server }: { server: ServerRecord }) {
  const toolCount = server.inspectResult?.tools.length ?? 0
  const resourceCount = server.inspectResult?.resources?.length ?? 0

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
          <strong>{toolCount}</strong>
        </div>
        <div>
          <span className="summary-label">Resources</span>
          <strong>{resourceCount}</strong>
        </div>
        <div>
          <span className="summary-label">Transport</span>
          <strong>{server.inspectResult?.transport || 'Unknown'}</strong>
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
