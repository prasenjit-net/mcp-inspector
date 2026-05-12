import {
  ArrowLeft,
  FileCode2,
  Image as ImageIcon,
  Link as LinkIcon,
  RefreshCw,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getResource, getServer, readResourceContent } from '../lib/api'
import type {
  ResourceContentPart,
  ResourceDetail,
  ServerDetail,
} from '../types'

export function ResourceDetailPage() {
  const { serverId, resourceId } = useParams()
  const [server, setServer] = useState<ServerDetail | null>(null)
  const [resource, setResource] = useState<ResourceDetail | null>(null)
  const [error, setError] = useState('')
  const [contentError, setContentError] = useState('')
  const [isLoadingContent, setIsLoadingContent] = useState(false)
  const [contents, setContents] = useState<ResourceContentPart[] | null>(null)

  useEffect(() => {
    if (!serverId || !resourceId) return
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
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load resource')
        }
      }
    })()

    return () => controller.abort()
  }, [resourceId, serverId])

  if (!serverId || !resourceId || !server || !resource) {
    return (
      <div className="empty-card">
        <h3>Resource not found</h3>
        <p>{error || 'The requested resource is not available in the backend catalog.'}</p>
        <Link className="primary-action" to={serverId ? `/servers/${serverId}` : '/servers'}>
          Back to server
        </Link>
      </div>
    )
  }

  async function handleLoadContent() {
    if (!serverId || !resourceId) return
    setIsLoadingContent(true)
    setContentError('')

    try {
      const payload = await readResourceContent(serverId, resourceId)
      setContents(payload.contents)
    } catch (loadError) {
      setContentError(loadError instanceof Error ? loadError.message : 'Unable to load resource content')
    } finally {
      setIsLoadingContent(false)
    }
  }

  return (
    <div className="page-container page-stack-lg">
      <div className="page-header">
        <div>
          <div className="breadcrumb-line">
            <Link to="/servers">Servers</Link>
            <span>/</span>
            <Link to={`/servers/${server.id}`}>{server.name}</Link>
            <span>/</span>
            <span>{resource.name}</span>
          </div>
          <h1 className="page-title">{resource.name}</h1>
          <p className="page-subtitle">{resource.description || 'No resource description provided.'}</p>
        </div>
        <div className="header-actions">
          <Link className="secondary-action" to={`/servers/${server.id}`}>
            <ArrowLeft className="button-icon" />
            Back to Server
          </Link>
        </div>
      </div>

      <section className="panel-card">
        <h3 className="section-title">Resource metadata</h3>
        <dl className="detail-list">
          <DetailRow label="Identifier" value={resource.id} mono />
          <DetailRow
            label="URI"
            value={resource.uri || 'Not provided'}
            mono
            icon={<LinkIcon className="inline-icon" />}
          />
          <DetailRow
            label="MIME type"
            value={resource.mimeType || 'Unknown'}
            icon={<FileCode2 className="inline-icon" />}
          />
        </dl>
      </section>

      <section className="panel-card">
        <div className="page-header">
          <div>
            <h3 className="section-title resource-section-title">
              <ImageIcon className="section-title-icon" />
              Resource content
            </h3>
            <p className="panel-copy">
              Read the live resource payload on demand and render it using its MIME type.
            </p>
          </div>
          <button
            className="primary-action"
            type="button"
            disabled={isLoadingContent}
            onClick={() => void handleLoadContent()}
          >
            <RefreshCw className={isLoadingContent ? 'button-icon spin' : 'button-icon'} />
            {contents
              ? isLoadingContent
                ? 'Refreshing...'
                : 'Reload content'
              : isLoadingContent
                ? 'Loading...'
                : 'Load content'}
          </button>
        </div>

        {contentError ? <div className="alert-error">{contentError}</div> : null}

        {contents && contents.length > 0 ? (
          <div className="resource-content-stack">
            {contents.map((content, index) => (
              <article key={`${content.uri}-${index}`} className="resource-content-card">
                <div className="resource-content-meta">
                  <span className="soft-pill">{content.mimeType || resource.mimeType || 'Unknown MIME'}</span>
                  <span className="mono-text resource-content-uri">
                    {content.uri || resource.uri || resource.id}
                  </span>
                </div>
                <ResourceContentView content={content} fallbackMimeType={resource.mimeType} />
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-card compact-empty">
            <p>Load the resource when you need to inspect its current contents.</p>
          </div>
        )}
      </section>
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono = false,
  icon,
}: {
  label: string
  value: string
  mono?: boolean
  icon?: ReactNode
}) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd className={mono ? 'mono-text inline-detail' : 'inline-detail'}>
        {icon}
        {value}
      </dd>
    </div>
  )
}

function ResourceContentView({
  content,
  fallbackMimeType,
}: {
  content: ResourceContentPart
  fallbackMimeType?: string
}) {
  const mimeType = (content.mimeType || fallbackMimeType || '').toLowerCase()
  const dataType = content.mimeType || fallbackMimeType || 'application/octet-stream'

  if (content.blob && mimeType.startsWith('image/')) {
    return <img className="resource-image" src={`data:${dataType};base64,${content.blob}`} alt={content.uri} />
  }

  if (content.blob && mimeType === 'application/pdf') {
    return <iframe className="resource-frame" src={`data:${dataType};base64,${content.blob}`} title={content.uri} />
  }

  if (content.blob && mimeType.startsWith('audio/')) {
    return <audio className="resource-media" controls src={`data:${dataType};base64,${content.blob}`} />
  }

  if (content.blob && mimeType.startsWith('video/')) {
    return <video className="resource-media" controls src={`data:${dataType};base64,${content.blob}`} />
  }

  if (content.text) {
    return <pre className="code-block resource-code-block">{formatResourceText(content.text, mimeType)}</pre>
  }

  if (content.blob) {
    return (
      <div className="resource-download-row">
        <span className="panel-copy">Binary content loaded.</span>
        <a
          className="secondary-action"
          href={`data:${dataType};base64,${content.blob}`}
          download={filenameFromURI(content.uri)}
        >
          Download
        </a>
      </div>
    )
  }

  return <p className="panel-copy">This content block did not include text or binary payload data.</p>
}

function formatResourceText(text: string, mimeType: string) {
  if (mimeType.includes('json')) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      return text
    }
  }

  return text
}

function filenameFromURI(uri: string) {
  const parts = uri.split('/')
  return parts[parts.length - 1] || 'resource'
}
