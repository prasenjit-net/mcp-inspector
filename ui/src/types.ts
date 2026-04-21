export type HealthResponse = {
  name: string
  status: string
  version: string
}

export type ToolDefinition = {
  name: string
  title?: string
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

export type InspectResponse = {
  url: string
  transport: string
  protocolVersion?: string
  instructions?: string
  server: {
    name?: string
    version?: string
  }
  tools: ToolDefinition[]
  resources?: ResourceDefinition[]
}

export type AuthType = 'none' | 'bearer' | 'header'
export type ThemeMode = 'dark' | 'light'
export type ServerStatus = 'ready' | 'error' | 'pending'

export type InspectFormState = {
  name: string
  serverURL: string
  authType: AuthType
  bearerToken: string
  headerName: string
  headerValue: string
}

export type ServerRecord = {
  id: string
  name: string
  endpoint: string
  authType: AuthType
  bearerToken: string
  headerName: string
  headerValue: string
  status: ServerStatus
  createdAt: string
  updatedAt: string
  lastInspectedAt?: string
  lastError?: string
  inspectResult?: InspectResponse
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
