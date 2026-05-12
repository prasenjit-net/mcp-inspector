import clsx from 'clsx'
import {
  Bot,
  Database,
  Menu,
  Monitor,
  Moon,
  Sun,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAppState } from '../state/useAppState'
import type { ThemeMode } from '../types'

const navigationItems = [
  { to: '/servers', icon: Database, label: 'Servers' },
  { to: '/agent', icon: Bot, label: 'Agent' },
]

const themeOptions: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
]

export function DashboardLayout() {
  const { health, healthError, theme, setThemeMode } = useAppState()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    if (!isSidebarOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isSidebarOpen])

  const CurrentThemeIcon = useMemo(() => {
    switch (theme) {
      case 'light':
        return Sun
      case 'dark':
        return Moon
      default:
        return Monitor
    }
  }, [theme])

  function cycleThemeMode() {
    switch (theme) {
      case 'light':
        setThemeMode('dark')
        break
      case 'dark':
        setThemeMode('system')
        break
      default:
        setThemeMode('light')
        break
    }
  }

  return (
    <div className="app-shell">
      {isSidebarOpen ? (
        <button
          className="app-sidebar-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setIsSidebarOpen(false)}
        />
      ) : null}

      <aside className={clsx('app-sidebar', isSidebarOpen && 'app-sidebar-open')}>
        <div className="sidebar-brand">
          <div className="brand-mark">M</div>
          <div>
            <div className="brand-title">MCP Inspector</div>
            <div className="brand-subtitle">Server control center</div>
          </div>
          <button
            className="icon-button sidebar-close-button"
            type="button"
            aria-label="Close navigation"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X className="button-icon" />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          <ul className="nav-list">
            {navigationItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/servers'}
                  className={({ isActive }) =>
                    clsx('nav-link', isActive && 'nav-link-active')
                  }
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <item.icon className="nav-link-icon" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <div className="theme-section-label">Theme</div>
          <div className="theme-switcher">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setThemeMode(option.value)}
                aria-pressed={theme === option.value}
                className={clsx('theme-button', theme === option.value && 'theme-button-active')}
              >
                <option.icon className="theme-button-icon" />
                {option.label}
              </button>
            ))}
          </div>

          <div className="sidebar-health">
            <div className="sidebar-health-title">{health?.name || 'Backend status'}</div>
            <div className="sidebar-health-copy">
              {health ? `${health.version} · Online` : healthError || 'Unavailable'}
            </div>
          </div>
        </div>
      </aside>

      <main className="app-main">
        <div className="app-mobile-header">
          <button
            className="icon-button"
            type="button"
            aria-label="Open navigation"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu className="button-icon" />
          </button>

          <div className="app-mobile-title">
            <div className="brand-title">MCP Inspector</div>
            <div className="brand-subtitle">Server control center</div>
          </div>

          <button
            className="icon-button"
            type="button"
            aria-label={`Switch theme mode. Current: ${theme}`}
            onClick={cycleThemeMode}
          >
            <CurrentThemeIcon className="button-icon" />
          </button>
        </div>

        <div className="app-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
