import { Link, useParams } from 'react-router-dom'
import { useAppState } from '../state/useAppState'

export function ResourceDetailPage() {
  const { serverId, resourceId } = useParams()
  const { getServerById } = useAppState()
  const server = serverId ? getServerById(serverId) : undefined

  return (
    <div className="page-stack">
      <section className="card empty-state">
        <h2 className="section-title">{resourceId ? decodeURIComponent(resourceId) : 'Resource detail'}</h2>
        <p>
          Resource detail pages are reserved in the routing hierarchy, but resource
          inspection data is not available from the backend yet.
        </p>
        <Link className="primary-button" to={server ? `/servers/${server.id}` : '/servers'}>
          Back to server
        </Link>
      </section>
    </div>
  )
}
