import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { HealthResponse, ThemeMode } from '../types'
import { AppStateContext, type AppStateValue } from './AppStateContext'

const themeStorageKey = 'mcp-inspector-theme'

export function AppStateProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthError, setHealthError] = useState('')

  useEffect(() => {
    applyThemeMode(theme)
    localStorage.setItem(themeStorageKey, theme)
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (theme === 'system') {
        applyThemeMode('system')
      }
    }

    if (media.addEventListener) {
      media.addEventListener('change', handler)
    } else {
      media.addListener(handler)
    }

    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', handler)
      } else {
        media.removeListener(handler)
      }
    }
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

  const setThemeMode = useCallback((nextTheme: ThemeMode) => {
    setTheme(nextTheme)
  }, [])

  const value = useMemo<AppStateValue>(
    () => ({
      theme,
      setThemeMode,
      health,
      healthError,
    }),
    [theme, setThemeMode, health, healthError],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  const stored = window.localStorage.getItem(themeStorageKey)
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored
  }

  return 'system'
}

function applyThemeMode(mode: ThemeMode) {
  if (typeof window === 'undefined') {
    return
  }

  const root = document.documentElement
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const useDark = mode === 'dark' || (mode === 'system' && prefersDark)

  root.classList.toggle('dark', useDark)
  root.dataset.theme = useDark ? 'dark' : 'light'
  root.style.colorScheme = useDark ? 'dark' : 'light'
}
