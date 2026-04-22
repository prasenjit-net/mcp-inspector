import type {
  AuthType,
  CreateServerFormState,
  ResourceDetail,
  ServerDetail,
  ServerSummary,
  ToolDetail,
} from '../types'

type APIError = {
  error?: string
}

export async function listServers(signal?: AbortSignal) {
  return requestJSON<{ servers: ServerSummary[] }>('/api/servers', { signal })
}

export async function getServer(serverId: string, signal?: AbortSignal) {
  return requestJSON<ServerDetail>(`/api/servers/${serverId}`, { signal })
}

export async function createServer(input: CreateServerFormState) {
  return requestJSON<ServerDetail>('/api/servers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      endpoint: input.endpoint,
      auth: buildAuthPayload(input),
    }),
  })
}

export async function reinspectServer(serverId: string) {
  return requestJSON<ServerDetail>(`/api/servers/${serverId}/reinspect`, {
    method: 'POST',
  })
}

export async function getTool(serverId: string, toolName: string, signal?: AbortSignal) {
  return requestJSON<ToolDetail>(
    `/api/servers/${serverId}/tools/${encodeURIComponent(toolName)}`,
    { signal },
  )
}

export async function getResource(
  serverId: string,
  resourceId: string,
  signal?: AbortSignal,
) {
  return requestJSON<ResourceDetail>(
    `/api/servers/${serverId}/resources/${encodeURIComponent(resourceId)}`,
    { signal },
  )
}

async function requestJSON<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init)
  const payload = (await response.json().catch(() => ({}))) as T & APIError
  if (!response.ok) {
    throw new Error(payload.error || `request failed: ${response.status}`)
  }
  return payload as T
}

function buildAuthPayload(input: CreateServerFormState) {
  switch (input.authType) {
    case 'bearer':
      return {
        type: 'bearer' as AuthType,
        token: input.bearerToken,
      }
    case 'header':
      return {
        type: 'header' as AuthType,
        headerName: input.headerName,
        headerValue: input.headerValue,
      }
    default:
      return { type: 'none' as AuthType }
  }
}
