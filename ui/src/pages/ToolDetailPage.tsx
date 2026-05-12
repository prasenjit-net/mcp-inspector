import clsx from 'clsx'
import { ArrowLeft, ChevronDown, Info, Workflow } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getServer, getTool } from '../lib/api'
import { extractSchemaFields, formatJSON } from '../lib/schema'
import type { SchemaField, ServerDetail, ToolDetail } from '../types'

export function ToolDetailPage() {
  const { serverId, toolName } = useParams()
  const [server, setServer] = useState<ServerDetail | null>(null)
  const [tool, setTool] = useState<ToolDetail | null>(null)
  const [error, setError] = useState('')
  const [schemaTab, setSchemaTab] = useState<'input' | 'output'>('input')
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => {
    if (!serverId || !toolName) return
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
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load tool')
        }
      }
    })()

    return () => controller.abort()
  }, [serverId, toolName])

  const inputFields = useMemo(() => extractSchemaFields(tool?.inputSchema), [tool?.inputSchema])
  const outputFields = useMemo(() => extractSchemaFields(tool?.outputSchema), [tool?.outputSchema])

  if (!serverId || !toolName || !server || !tool) {
    return (
      <div className="empty-card">
        <h3>Tool not found</h3>
        <p>{error || 'The requested tool is not available in the backend catalog.'}</p>
        <Link className="primary-action" to={serverId ? `/servers/${serverId}` : '/servers'}>
          Back
        </Link>
      </div>
    )
  }

  const fields = schemaTab === 'input' ? inputFields : outputFields
  const rawSchema = schemaTab === 'input' ? tool.inputSchema : tool.outputSchema

  return (
    <div className="page-container page-stack-lg">
      <div className="page-header">
        <div>
          <div className="breadcrumb-line">
            <Link to="/servers">Servers</Link>
            <span>/</span>
            <Link to={`/servers/${server.id}`}>{server.name}</Link>
            <span>/</span>
            <span>{tool.displayName}</span>
          </div>
          <h1 className="page-title">{tool.displayName}</h1>
          <p className="page-subtitle">{tool.description || 'No tool description provided.'}</p>
        </div>
        <div className="header-actions">
          <Link className="secondary-action" to={`/servers/${server.id}`}>
            <ArrowLeft className="button-icon" />
            Back to Server
          </Link>
        </div>
      </div>

      <div className="two-column-grid">
        <section className="panel-card">
          <h3 className="section-title"><Info className="section-title-icon" /> Metadata</h3>
          <dl className="detail-list">
            <DetailRow label="Name" value={tool.name} mono />
            <DetailRow label="Display name" value={tool.displayName} />
            <DetailRow label="Read only" value={tool.annotations?.readOnlyHint ? 'Yes' : 'No'} />
            <DetailRow label="Idempotent" value={tool.annotations?.idempotentHint ? 'Yes' : 'No'} />
            <DetailRow label="Open world" value={tool.annotations?.openWorldHint ? 'Yes' : 'No'} />
          </dl>
        </section>

        <section className="panel-card">
          <h3 className="section-title"><Workflow className="section-title-icon" /> Field summary</h3>
          <div className="summary-kpi-grid">
            <div className="summary-kpi">
              <span className="meta-label">Input fields</span>
              <strong>{inputFields.length}</strong>
            </div>
            <div className="summary-kpi">
              <span className="meta-label">Output fields</span>
              <strong>{outputFields.length}</strong>
            </div>
          </div>
        </section>
      </div>

      <section className="panel-card">
        <div className="tabs-row">
          <button className={schemaTab === 'input' ? 'tab-button tab-button-active' : 'tab-button'} type="button" onClick={() => setSchemaTab('input')}>
            Input schema
          </button>
          <button className={schemaTab === 'output' ? 'tab-button tab-button-active' : 'tab-button'} type="button" onClick={() => setSchemaTab('output')}>
            Output schema
          </button>
        </div>

        {fields.length > 0 ? (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Required</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field: SchemaField) => (
                  <tr key={field.name}>
                    <td>{field.name}</td>
                    <td>{field.type}</td>
                    <td>{field.description}</td>
                    <td>{field.required ? 'Required' : 'Optional'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-card compact-empty">
            <p>No top-level {schemaTab} fields were available.</p>
          </div>
        )}

        <button className="collapse-trigger" type="button" onClick={() => setShowRaw((current) => !current)}>
          <ChevronDown className={clsx('button-icon', showRaw && 'rotate-180')} />
          Raw schema JSON
        </button>
        {showRaw ? <pre className="code-block">{formatJSON(rawSchema)}</pre> : null}
      </section>
    </div>
  )
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd className={mono ? 'mono-text' : undefined}>{value}</dd>
    </div>
  )
}
