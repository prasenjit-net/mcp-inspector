import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { HealthResponse, ThemeMode } from '../types'
import { AppStateContext, type AppStateValue } from './AppStateContext'

const themeStorageKey = 'mcp-inspector-theme'

export function AppStateProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthError, setHealthError] = useState('')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(themeStorageKey, theme)
  }, [theme])

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

  const value = useMemo<AppStateValue>(
    () => ({
      theme,
      toggleTheme,
      health,
      healthError,
    }),
    [theme, toggleTheme, health, healthError],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  const stored = window.localStorage.getItem(themeStorageKey)
  if (stored === 'light' || stored === 'dark') {
    return stored
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
