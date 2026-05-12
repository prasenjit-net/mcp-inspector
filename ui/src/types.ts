export type HealthResponse = {
  name: string
  status: string
  version: string
}

export type ToolDefinition = {
  name: string
  displayName: string
  description?: string
  annotations?: {
    title?: string
    readOnlyHint?: boolean
    idempotentHint?: boolean
    destructiveHint?: boolean
    openWorldHint?: boolean
  }
  inputSchema: unknown
  outputSchema?: unknown
}

export type ResourceDefinition = {
  id: string
  name: string
  uri?: string
  description?: string
  mimeType?: string
}

export type AuthType = 'none' | 'bearer' | 'header'
export type ThemeMode = 'light' | 'dark' | 'system'
export type ServerStatus = 'ready' | 'error' | 'pending'

export type ServerSummary = {
  id: string
  name: string
  endpoint: string
  status: ServerStatus
  lastInspectedAt?: string
  lastError?: string
  transport?: string
  toolCount: number
  resourceCount: number
}

export type ServerDetail = ServerSummary & {
  serverName?: string
  serverVersion?: string
  protocolVersion?: string
  instructions?: string
  tools: ToolSummary[]
  resources: ResourceDefinition[]
}

export type ToolSummary = {
  name: string
  displayName: string
  description?: string
  inputFieldCount: number
  outputFieldCount: number
  annotations?: ToolDefinition['annotations']
}

export type ToolDetail = ToolDefinition & {
  serverId: string
}

export type ResourceDetail = ResourceDefinition & {
  serverId: string
}

export type ResourceContentPart = {
  uri: string
  mimeType?: string
  text?: string
  blob?: string
}

export type ResourceContentResponse = {
  serverId: string
  resource: ResourceDefinition
  contents: ResourceContentPart[]
}

export type CreateServerFormState = {
  name: string
  endpoint: string
  authType: AuthType
  bearerToken: string
  headerName: string
  headerValue: string
}

export type SchemaObject = {
  type?: string
  description?: string
  properties?: Record<string, SchemaObject>
  required?: string[]
}

export type SchemaField = {
  name: string
  type: string
  description: string
  required: boolean
}
