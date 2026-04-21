import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import type {
  HealthResponse,
  InspectFormState,
  InspectResponse,
  ServerRecord,
  ThemeMode,
} from '../types'
import { AppStateContext, type AppStateValue } from './AppStateContext'

const themeStorageKey = 'mcp-inspector-theme'
const serversStorageKey = 'mcp-inspector-servers'

const initialDraftServer: InspectFormState = {
  name: '',
  serverURL: 'http://localhost:8000',
  authType: 'none',
  bearerToken: '',
  headerName: '',
  headerValue: '',
}

export function AppStateProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthError, setHealthError] = useState('')
  const [servers, setServers] = useState<ServerRecord[]>(getInitialServers)
  const [isCreatingServer, setIsCreatingServer] = useState(false)
  const [createServerError, setCreateServerError] = useState('')
  const [draftServer, setDraftServer] = useState<InspectFormState>(initialDraftServer)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(themeStorageKey, theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem(serversStorageKey, JSON.stringify(servers))
  }, [servers])

  useEffect(() => {
    const controller = new AbortController()

    void (async () => {
      try {
        const response = await fetch('/api/health', { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`backend health check failed: ${response.status}`)
        }

        const payload = (await response.json()) as HealthResponse
        setHealth(payload)
        setHealthError('')
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        const message =
          error instanceof Error ? error.message : 'unable to reach the backend'
        setHealthError(message)
      }
    })()

    return () => controller.abort()
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))
  }, [])

  const updateDraftServer = useCallback((patch: Partial<InspectFormState>) => {
    setDraftServer((currentDraft) => ({ ...currentDraft, ...patch }))
  }, [])

  const inspectServer = useCallback(async (draft: InspectFormState) => {
    const response = await fetch('/api/inspect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: draft.serverURL,
        auth:
          draft.authType === 'bearer'
            ? { type: 'bearer', token: draft.bearerToken }
            : draft.authType === 'header'
              ? {
                  type: 'header',
                  headerName: draft.headerName,
                  headerValue: draft.headerValue,
                }
              : { type: 'none' },
      }),
    })

    const payload = (await response.json()) as InspectResponse | { error: string }
    if (!response.ok) {
      throw new Error('error' in payload ? payload.error : `request failed: ${response.status}`)
    }

    const normalized = payload as InspectResponse
    return {
      ...normalized,
      resources: normalized.resources ?? [],
    }
  }, [])

  const createServer = useCallback(async () => {
    setIsCreatingServer(true)
    setCreateServerError('')

    const timestamp = new Date().toISOString()
    const serverId = crypto.randomUUID()
    const trimmedName = draftServer.name.trim() || inferServerName(draftServer.serverURL)

    try {
      const inspectResult = await inspectServer(draftServer)
      const record: ServerRecord = {
        id: serverId,
        name: trimmedName,
        endpoint: draftServer.serverURL.trim(),
        authType: draftServer.authType,
        bearerToken: draftServer.bearerToken,
        headerName: draftServer.headerName,
        headerValue: draftServer.headerValue,
        status: 'ready',
        createdAt: timestamp,
        updatedAt: timestamp,
        lastInspectedAt: timestamp,
        inspectResult,
      }

      setServers((currentServers) => [record, ...currentServers])
      setDraftServer((currentDraft) => ({
        ...currentDraft,
        name: '',
      }))
      return serverId
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unable to inspect the server'

      const record: ServerRecord = {
        id: serverId,
        name: trimmedName,
        endpoint: draftServer.serverURL.trim(),
        authType: draftServer.authType,
        bearerToken: draftServer.bearerToken,
        headerName: draftServer.headerName,
        headerValue: draftServer.headerValue,
        status: 'error',
        createdAt: timestamp,
        updatedAt: timestamp,
        lastError: message,
      }

      setServers((currentServers) => [record, ...currentServers])
      setCreateServerError(message)
      return serverId
    } finally {
      setIsCreatingServer(false)
    }
  }, [draftServer, inspectServer])

  const reinspectServer = useCallback(
    async (serverId: string) => {
      const server = servers.find((entry) => entry.id === serverId)
      if (!server) {
        return
      }

      const timestamp = new Date().toISOString()
      setServers((currentServers) =>
        currentServers.map((entry) =>
          entry.id === serverId
            ? {
                ...entry,
                status: 'pending',
                updatedAt: timestamp,
                lastError: '',
              }
            : entry,
        ),
      )

      try {
        const inspectResult = await inspectServer({
          name: server.name,
          serverURL: server.endpoint,
          authType: server.authType,
          bearerToken: server.bearerToken,
          headerName: server.headerName,
          headerValue: server.headerValue,
        })

        setServers((currentServers) =>
          currentServers.map((entry) =>
            entry.id === serverId
              ? {
                  ...entry,
                  status: 'ready',
                  updatedAt: timestamp,
                  lastInspectedAt: timestamp,
                  lastError: '',
                  inspectResult,
                }
              : entry,
          ),
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'unable to inspect the server'

        setServers((currentServers) =>
          currentServers.map((entry) =>
            entry.id === serverId
              ? {
                  ...entry,
                  status: 'error',
                  updatedAt: timestamp,
                  lastError: message,
                }
              : entry,
          ),
        )
      }
    },
    [inspectServer, servers],
  )

  const getServerById = useCallback(
    (serverId: string) => servers.find((server) => server.id === serverId),
    [servers],
  )

  const value = useMemo<AppStateValue>(
    () => ({
      theme,
      toggleTheme,
      health,
      healthError,
      servers,
      isCreatingServer,
      createServerError,
      draftServer,
      updateDraftServer,
      createServer,
      reinspectServer,
      getServerById,
      inspectServer,
    }),
    [
      theme,
      toggleTheme,
      health,
      healthError,
      servers,
      isCreatingServer,
      createServerError,
      draftServer,
      updateDraftServer,
      createServer,
      reinspectServer,
      getServerById,
      inspectServer,
    ],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

function getInitialTheme(): ThemeMode {
  const storedTheme = localStorage.getItem(themeStorageKey)
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialServers(): ServerRecord[] {
  const storedValue = localStorage.getItem(serversStorageKey)
  if (!storedValue) {
    return []
  }

  try {
    const parsed = JSON.parse(storedValue) as ServerRecord[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function inferServerName(endpoint: string): string {
  try {
    const url = new URL(endpoint)
    return url.hostname || 'New server'
  } catch {
    return 'New server'
  }
}
