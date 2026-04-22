import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getServer, reinspectServer } from '../lib/api'
import type { ServerDetail } from '../types'

export function ServerDetailPage() {
  const { serverId } = useParams()
  const [server, setServer] = useState<ServerDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isReinspecting, setIsReinspecting] = useState(false)

  useEffect(() => {
    if (!serverId) {
      return
    }

    const controller = new AbortController()

    void (async () => {
      try {
        const payload = await getServer(serverId, controller.signal)
        setServer(payload)
        setError('')
      } catch (loadError) {
        if (controller.signal.aborted) {
          return
        }
        setError(loadError instanceof Error ? loadError.message : 'unable to load server')
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    })()

    return () => controller.abort()
  }, [serverId])

  if (!serverId) {
    return (
      <section className="card empty-state">
        <h2 className="section-title">Server not found</h2>
        <p>This route is missing the selected server identifier.</p>
        <Link className="primary-button" to="/servers">
          Back to Servers
        </Link>
      </section>
    )
  }

  async function handleReinspect() {
    if (!serverId) {
      return
    }

    setIsReinspecting(true)
    try {
      const payload = await reinspectServer(serverId)
      setServer(payload)
      setError('')
    } catch (reinspectError) {
      setError(reinspectError instanceof Error ? reinspectError.message : 'unable to reinspect')
    } finally {
      setIsReinspecting(false)
    }
  }

  if (isLoading) {
    return (
      <section className="card empty-state">
        <h2 className="section-title">Loading server</h2>
        <p>Fetching backend-owned inspection details.</p>
      </section>
    )
  }

  if (!server) {
    return (
      <section className="card empty-state">
        <h2 className="section-title">Server not found</h2>
        <p>{error || 'This server entry no longer exists in the backend data store.'}</p>
        <Link className="primary-button" to="/servers">
          Back to Servers
        </Link>
      </section>
    )
  }

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <div className="breadcrumb-row" aria-label="Breadcrumb">
            <Link className="breadcrumb-link" to="/servers">
              Servers
            </Link>
            <span className="breadcrumb-separator">/</span>
            <span>{server.name}</span>
          </div>
          <h2 className="section-title">{server.name}</h2>
          <p className="section-copy">{server.endpoint}</p>
        </div>

        <div className="form-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => void handleReinspect()}
            disabled={isReinspecting}
          >
            {isReinspecting ? 'Inspecting...' : 'Reinspect'}
          </button>
        </div>
      </section>

      {error ? <p className="error-banner">{error}</p> : null}

      <section className="summary-grid">
        <article className="card summary-card">
          <span className="summary-label">Status</span>
          <strong>{server.status === 'ready' ? 'Ready' : server.status === 'pending' ? 'Inspecting' : 'Needs attention'}</strong>
          <p>{server.lastError || 'Latest inspection result is available.'}</p>
        </article>
        <article className="card summary-card">
          <span className="summary-label">Tools</span>
          <strong>{server.toolCount}</strong>
          <p>Sanitized tool definitions from the latest backend inspection.</p>
        </article>
        <article className="card summary-card">
          <span className="summary-label">Resources</span>
          <strong>{server.resourceCount}</strong>
          <p>Available resource entries discovered during inspection.</p>
        </article>
      </section>

      <section className="content-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h3>Overview</h3>
              <p>Connection and server metadata.</p>
            </div>
          </div>

          <dl className="meta-list">
            <div>
              <dt>Name</dt>
              <dd>{server.serverName || server.name}</dd>
            </div>
            <div>
              <dt>Endpoint</dt>
              <dd className="mono-block">{server.endpoint}</dd>
            </div>
            <div>
              <dt>Protocol</dt>
              <dd>{server.protocolVersion || 'Unknown'}</dd>
            </div>
            <div>
              <dt>Transport</dt>
              <dd>{server.transport || 'Unknown'}</dd>
            </div>
            <div>
              <dt>Server version</dt>
              <dd>{server.serverVersion || 'Unknown'}</dd>
            </div>
            <div>
              <dt>Last inspected</dt>
              <dd>{server.lastInspectedAt || 'Not inspected yet'}</dd>
            </div>
          </dl>
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h3>Instructions</h3>
              <p>Server-provided guidance for clients and agents.</p>
            </div>
          </div>

          <p>{server.instructions || 'No server instructions were provided.'}</p>
        </article>
      </section>

      <section className="section-heading">
        <div>
          <h3>Tools</h3>
          <p>Dedicated pages for every discovered tool.</p>
        </div>
      </section>

      {server.tools.length > 0 ? (
        <section className="server-grid">
          {server.tools.map((tool) => (
            <Link
              key={tool.name}
              className="card tool-summary-card"
              to={`/servers/${server.id}/tools/${encodeURIComponent(tool.name)}`}
            >
              <div className="server-card-header">
                <div>
                  <h3>{tool.displayName}</h3>
                  <p className="server-card-endpoint">{tool.name}</p>
                </div>
              </div>
              <p>{tool.description || 'No description provided.'}</p>
              <span className="server-card-link">View details</span>
            </Link>
          ))}
        </section>
      ) : (
        <section className="card empty-state">
          <h3>No tools found</h3>
          <p>The latest inspection did not return any tools.</p>
        </section>
      )}

      <section className="section-heading">
        <div>
          <h3>Resources</h3>
          <p>Dedicated pages for discovered resources.</p>
        </div>
      </section>

      {server.resources.length > 0 ? (
        <section className="server-grid">
          {server.resources.map((resource) => (
            <Link
              key={resource.id}
              className="card tool-summary-card"
              to={`/servers/${server.id}/resources/${encodeURIComponent(resource.id)}`}
            >
              <div className="server-card-header">
                <div>
                  <h3>{resource.name}</h3>
                  <p className="server-card-endpoint">{resource.uri || resource.id}</p>
                </div>
              </div>
              <p>{resource.description || 'No description provided.'}</p>
              <span className="server-card-link">View details</span>
            </Link>
          ))}
        </section>
      ) : (
        <section className="card empty-state">
          <h3>No resources available</h3>
          <p>The latest inspection did not return any resources.</p>
        </section>
      )}
    </div>
  )
}
