import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getResource, getServer } from '../lib/api'
import type { ResourceDetail, ServerDetail } from '../types'

export function ResourceDetailPage() {
  const { serverId, resourceId } = useParams()
  const [server, setServer] = useState<ServerDetail | null>(null)
  const [resource, setResource] = useState<ResourceDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!serverId || !resourceId) {
      return
    }

    const controller = new AbortController()

    void (async () => {
      try {
        const [serverPayload, resourcePayload] = await Promise.all([
          getServer(serverId, controller.signal),
          getResource(serverId, resourceId, controller.signal),
        ])
        setServer(serverPayload)
        setResource(resourcePayload)
        setError('')
      } catch (loadError) {
        if (controller.signal.aborted) {
          return
        }
        setError(loadError instanceof Error ? loadError.message : 'unable to load resource')
      }
    })()

    return () => controller.abort()
  }, [serverId, resourceId])

  if (!serverId || !resourceId) {
    return (
      <section className="card empty-state">
        <h2 className="section-title">Resource not found</h2>
        <p>This route is missing the selected resource identifier.</p>
        <Link className="primary-button" to={serverId ? `/servers/${serverId}` : '/servers'}>
          Back to server
        </Link>
      </section>
    )
  }

  if (!server || !resource) {
    return (
      <section className="card empty-state">
        <h2 className="section-title">Resource not found</h2>
        <p>{error || 'The requested resource is not available in the backend catalog.'}</p>
        <Link className="primary-button" to={serverId ? `/servers/${serverId}` : '/servers'}>
          Back to server
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
            <Link className="breadcrumb-link" to={`/servers/${server.id}`}>
              {server.name}
            </Link>
            <span className="breadcrumb-separator">/</span>
            <span>{resource.name}</span>
          </div>
          <h2 className="section-title">{resource.name}</h2>
          <p className="section-copy">{resource.description || 'No resource description provided.'}</p>
        </div>
      </section>

      {error ? <p className="error-banner">{error}</p> : null}

      <section className="card">
        <div className="section-heading">
          <div>
            <h3>Metadata</h3>
            <p>Backend-filtered resource details from the selected server.</p>
          </div>
        </div>

        <dl className="meta-list">
          <div>
            <dt>ID</dt>
            <dd className="mono-block">{resource.id}</dd>
          </div>
          <div>
            <dt>URI</dt>
            <dd className="mono-block">{resource.uri || 'Not provided'}</dd>
          </div>
          <div>
            <dt>MIME type</dt>
            <dd>{resource.mimeType || 'Unknown'}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
