import { Link, useParams } from 'react-router-dom'
import { useAppState } from '../state/useAppState'

export function ServerDetailPage() {
  const { serverId } = useParams()
  const { getServerById, reinspectServer } = useAppState()
  const server = serverId ? getServerById(serverId) : undefined

  if (!server) {
    return (
      <section className="card empty-state">
        <h2 className="section-title">Server not found</h2>
        <p>This server entry no longer exists in the local workspace.</p>
        <Link className="primary-button" to="/servers">
          Back to Servers
        </Link>
      </section>
    )
  }

  const toolCount = server.inspectResult?.tools.length ?? 0
  const resourceCount = server.inspectResult?.resources?.length ?? 0

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h2 className="section-title">{server.name}</h2>
          <p className="section-copy">{server.endpoint}</p>
        </div>

        <div className="form-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => void reinspectServer(server.id)}
          >
            Reinspect
          </button>
        </div>
      </section>

      <section className="summary-grid">
        <article className="card summary-card">
          <span className="summary-label">Status</span>
          <strong>{server.status === 'ready' ? 'Ready' : server.status === 'pending' ? 'Inspecting' : 'Needs attention'}</strong>
          <p>{server.lastError || 'Latest inspection result is available.'}</p>
        </article>
        <article className="card summary-card">
          <span className="summary-label">Tools</span>
          <strong>{toolCount}</strong>
          <p>Tool definitions discovered from the latest inspection.</p>
        </article>
        <article className="card summary-card">
          <span className="summary-label">Resources</span>
          <strong>{resourceCount}</strong>
          <p>Resource inventory will populate here when resource inspection is available.</p>
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
              <dd>{server.inspectResult?.server.name || server.name}</dd>
            </div>
            <div>
              <dt>Endpoint</dt>
              <dd className="mono-block">{server.endpoint}</dd>
            </div>
            <div>
              <dt>Protocol</dt>
              <dd>{server.inspectResult?.protocolVersion || 'Unknown'}</dd>
            </div>
            <div>
              <dt>Transport</dt>
              <dd>{server.inspectResult?.transport || 'Unknown'}</dd>
            </div>
            <div>
              <dt>Server version</dt>
              <dd>{server.inspectResult?.server.version || 'Unknown'}</dd>
            </div>
            <div>
              <dt>Authorization</dt>
              <dd>{server.authType === 'none' ? 'None' : server.authType === 'bearer' ? 'Bearer token' : 'Custom header'}</dd>
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

          <p>{server.inspectResult?.instructions || 'No server instructions were provided.'}</p>
        </article>
      </section>

      <section className="section-heading">
        <div>
          <h3>Tools</h3>
          <p>Dedicated pages for every discovered tool.</p>
        </div>
      </section>

      {toolCount > 0 ? (
        <section className="server-grid">
          {server.inspectResult?.tools.map((tool) => (
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
          <p>Resource pages will appear here once the backend returns resource metadata.</p>
        </div>
      </section>

      <section className="card empty-state">
        <h3>No resources available</h3>
        <p>The current backend inspection flow is focused on tools first.</p>
      </section>
    </div>
  )
}
