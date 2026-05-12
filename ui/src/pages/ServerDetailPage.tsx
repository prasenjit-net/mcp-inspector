import clsx from 'clsx'
import {
  Activity,
  ArrowLeft,
  Box,
  FolderOpen,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteServer, getServer, reinspectServer } from '../lib/api'
import type { ServerDetail } from '../types'

type ActiveTab = 'overview' | 'tools' | 'resources'

export function ServerDetailPage() {
  const { serverId } = useParams()
  const navigate = useNavigate()
  const [server, setServer] = useState<ServerDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isReinspecting, setIsReinspecting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')

  useEffect(() => {
    if (!serverId) return
    const controller = new AbortController()

    void (async () => {
      try {
        const payload = await getServer(serverId, controller.signal)
        setServer(payload)
        setError('')
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load server')
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    })()

    return () => controller.abort()
  }, [serverId])

  async function handleReinspect() {
    if (!serverId) return
    setIsReinspecting(true)
    try {
      const payload = await reinspectServer(serverId)
      setServer(payload)
      setError('')
    } catch (reinspectError) {
      setError(reinspectError instanceof Error ? reinspectError.message : 'Unable to reinspect')
    } finally {
      setIsReinspecting(false)
    }
  }

  async function handleDelete() {
    if (!serverId || !server || !window.confirm(`Remove ${server.name}?`)) return
    setIsDeleting(true)
    try {
      await deleteServer(serverId)
      void navigate('/servers')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to remove server')
      setIsDeleting(false)
    }
  }

  if (!serverId) {
    return <StateCard title="Server not found" message="This route is missing the selected server identifier." />
  }
  if (isLoading) {
    return <div className="page-loading" />
  }
  if (!server) {
    return <StateCard title="Server not found" message={error || 'This server is no longer available.'} />
  }

  return (
    <div className="page-container page-stack-lg">
      <div className="page-header">
        <div>
          <div className="breadcrumb-line">
            <Link to="/servers">Servers</Link>
            <span>/</span>
            <span>{server.name}</span>
          </div>
          <h1 className="page-title">{server.name}</h1>
          <p className="page-subtitle">{server.endpoint}</p>
        </div>
        <div className="header-actions">
          <Link className="secondary-action" to="/servers">
            <ArrowLeft className="button-icon" />
            Back to Servers
          </Link>
          <button className="secondary-action" type="button" onClick={() => void handleReinspect()} disabled={isReinspecting}>
            <RefreshCw className={clsx('button-icon', isReinspecting && 'spin')} />
            {isReinspecting ? 'Inspecting...' : 'Reinspect'}
          </button>
          <button className="danger-ghost" type="button" onClick={() => void handleDelete()} disabled={isDeleting}>
            <Trash2 className="button-icon" />
            {isDeleting ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </div>

      {error ? <div className="alert-error">{error}</div> : null}

      <section className="panel-card detail-stats-card">
        <div className="detail-stats-grid">
          <StatMini icon={Activity} label="Status" value={server.status === 'ready' ? 'Ready' : server.status === 'pending' ? 'Inspecting' : 'Attention'} />
          <StatMini icon={Box} label="Tools" value={String(server.toolCount)} />
          <StatMini icon={FolderOpen} label="Resources" value={String(server.resourceCount)} />
          <StatMini icon={Activity} label="Transport" value={server.transport || 'Unknown'} />
        </div>
      </section>

      <div className="tabs-row">
        {(['overview', 'tools', 'resources'] as ActiveTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={clsx('tab-button', activeTab === tab && 'tab-button-active')}
            onClick={() => setActiveTab(tab)}
          >
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'overview' ? (
        <div className="two-column-grid">
          <section className="panel-card">
            <h3 className="section-title">Connection profile</h3>
            <dl className="detail-list">
              <DetailRow label="Workspace name" value={server.serverName || server.name} />
              <DetailRow label="Endpoint" value={server.endpoint} mono />
              <DetailRow label="Protocol" value={server.protocolVersion || 'Unknown'} />
              <DetailRow label="Transport" value={server.transport || 'Unknown'} />
              <DetailRow label="Server version" value={server.serverVersion || 'Unknown'} />
              <DetailRow label="Last inspected" value={server.lastInspectedAt || 'Not inspected yet'} />
            </dl>
          </section>
          <section className="panel-card">
            <h3 className="section-title">Instructions</h3>
            <p className="panel-copy">{server.instructions || 'No server instructions were provided.'}</p>
          </section>
        </div>
      ) : null}

      {activeTab === 'tools' ? (
        server.tools.length > 0 ? (
          <section className="panel-card">
            <h3 className="section-title">Tools</h3>
            <div className="list-panel">
              {server.tools.map((tool) => (
                <Link key={tool.name} to={`/servers/${server.id}/tools/${encodeURIComponent(tool.name)}`} className="list-row">
                  <div>
                    <div className="list-row-title">{tool.displayName}</div>
                    <div className="list-row-copy">{tool.description || 'No description provided.'}</div>
                  </div>
                  <div className="list-row-meta">
                    <span className="soft-pill">{tool.inputFieldCount} inputs</span>
                    <span className="soft-pill">{tool.outputFieldCount} outputs</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <StateCard title="No tools found" message="The latest inspection did not return any tools." />
        )
      ) : null}

      {activeTab === 'resources' ? (
        server.resources.length > 0 ? (
          <section className="panel-card">
            <h3 className="section-title">Resources</h3>
            <div className="list-panel">
              {server.resources.map((resource) => (
                <Link key={resource.id} to={`/servers/${server.id}/resources/${encodeURIComponent(resource.id)}`} className="list-row">
                  <div>
                    <div className="list-row-title">{resource.name}</div>
                    <div className="list-row-copy">{resource.description || resource.uri || 'No description provided.'}</div>
                  </div>
                  <div className="list-row-meta">
                    <span className="soft-pill">{resource.mimeType || 'Unknown MIME'}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <StateCard title="No resources found" message="The latest inspection did not return any resources." />
        )
      ) : null}
    </div>
  )
}

function StatMini({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return (
    <div className="detail-stat-item">
      <div className="stat-icon stat-icon-blue detail-stat-icon">
        <Icon className="stat-icon-svg" />
      </div>
      <div className="detail-stat-copy">
        <p className="stat-label">{label}</p>
        <p className="stat-value detail-stat-value">{value}</p>
      </div>
    </div>
  )
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd className={clsx(mono && 'mono-text')}>{value}</dd>
    </div>
  )
}

function StateCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="empty-card">
      <h3>{title}</h3>
      <p>{message}</p>
      <Link className="primary-action" to="/servers">
        Back to Servers
      </Link>
    </div>
  )
}
