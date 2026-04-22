import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getServer, getTool } from '../lib/api'
import { formatJSON, extractSchemaFields } from '../lib/schema'
import type { ServerDetail, ToolDetail } from '../types'

export function ToolDetailPage() {
  const { serverId, toolName } = useParams()
  const [server, setServer] = useState<ServerDetail | null>(null)
  const [tool, setTool] = useState<ToolDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!serverId || !toolName) {
      return
    }

    const controller = new AbortController()

    void (async () => {
      try {
        const [serverPayload, toolPayload] = await Promise.all([
          getServer(serverId, controller.signal),
          getTool(serverId, toolName, controller.signal),
        ])
        setServer(serverPayload)
        setTool(toolPayload)
        setError('')
      } catch (loadError) {
        if (controller.signal.aborted) {
          return
        }
        setError(loadError instanceof Error ? loadError.message : 'unable to load tool')
      }
    })()

    return () => controller.abort()
  }, [serverId, toolName])

  if (!serverId || !toolName) {
    return (
      <section className="card empty-state">
        <h2 className="section-title">Tool not found</h2>
        <p>This route is missing the selected tool identifier.</p>
        <Link className="primary-button" to={serverId ? `/servers/${serverId}` : '/servers'}>
          Back
        </Link>
      </section>
    )
  }

  if (!server || !tool) {
    return (
      <section className="card empty-state">
        <h2 className="section-title">Tool not found</h2>
        <p>{error || 'The requested tool is not available in the backend catalog.'}</p>
        <Link className="primary-button" to={serverId ? `/servers/${serverId}` : '/servers'}>
          Back
        </Link>
      </section>
    )
  }

  const inputFields = extractSchemaFields(tool.inputSchema)
  const outputFields = extractSchemaFields(tool.outputSchema)

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <div className="breadcrumb-row" aria-label="Breadcrumb">
            <Link className="breadcrumb-link" to="/servers">
              Servers
            </Link>
            <span className="breadcrumb-separator">/</span>
            <Link className="breadcrumb-link" to={`/servers/${server.id}`}>
              {server.name}
            </Link>
            <span className="breadcrumb-separator">/</span>
            <span>{tool.displayName}</span>
          </div>
          <h2 className="section-title">{tool.displayName}</h2>
          <p className="section-copy">{tool.description || 'No tool description provided.'}</p>
        </div>
      </section>

      {error ? <p className="error-banner">{error}</p> : null}

      <section className="content-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h3>Metadata</h3>
              <p>Core tool properties and execution hints.</p>
            </div>
          </div>

          <dl className="meta-list">
            <div>
              <dt>Name</dt>
              <dd className="mono-block">{tool.name}</dd>
            </div>
            <div>
              <dt>Display name</dt>
              <dd>{tool.displayName}</dd>
            </div>
            <div>
              <dt>Read only</dt>
              <dd>{tool.annotations?.readOnlyHint ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt>Idempotent</dt>
              <dd>{tool.annotations?.idempotentHint ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt>Open world</dt>
              <dd>{tool.annotations?.openWorldHint ? 'Yes' : 'No'}</dd>
            </div>
          </dl>
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h3>Field summary</h3>
              <p>Top-level schema fields extracted for quick review.</p>
            </div>
          </div>

          <div className="tool-preview-list">
            <div className="tool-preview-row">
              <div>
                <strong>Input fields</strong>
                <p className="tool-preview-description">{inputFields.length} top-level fields</p>
              </div>
            </div>
            <div className="tool-preview-row">
              <div>
                <strong>Output fields</strong>
                <p className="tool-preview-description">{outputFields.length} top-level fields</p>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="schema-grid">
        <article className="card schema-panel">
          <h3>Input schema</h3>
          {inputFields.length > 0 ? (
            <div className="field-list">
              {inputFields.map((field) => (
                <div key={field.name} className="field-card">
                  <div className="field-card-header">
                    <strong>{field.name}</strong>
                    <span>{field.type}</span>
                  </div>
                  <p>{field.description}</p>
                  {field.required ? <span className="field-required">Required</span> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="schema-empty">No top-level input fields were available.</p>
          )}
          <pre className="schema-json">{formatJSON(tool.inputSchema)}</pre>
        </article>

        <article className="card schema-panel">
          <h3>Output schema</h3>
          {outputFields.length > 0 ? (
            <div className="field-list">
              {outputFields.map((field) => (
                <div key={field.name} className="field-card">
                  <div className="field-card-header">
                    <strong>{field.name}</strong>
                    <span>{field.type}</span>
                  </div>
                  <p>{field.description}</p>
                  {field.required ? <span className="field-required">Required</span> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="schema-empty">No top-level output fields were available.</p>
          )}
          <pre className="schema-json">{formatJSON(tool.outputSchema)}</pre>
        </article>
      </section>
    </div>
  )
}
