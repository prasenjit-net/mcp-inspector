import { useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAppState } from '../state/useAppState'

const navigationItems = [
  { to: '/servers', label: 'Servers', icon: '▣' },
  { to: '/agent', label: 'Agent', icon: '✦' },
]

export function DashboardLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const location = useLocation()
  const { health, healthError, theme, toggleTheme } = useAppState()

  const breadcrumbs = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean)
    if (segments.length === 0 || segments[0] === 'servers') {
      const items = [{ label: 'Servers', to: '/servers' }]

      if (segments[1]) {
        items.push({ label: 'Details', to: location.pathname })
      }

      if (segments[2] === 'tools' && segments[3]) {
        items.push({ label: 'Tool', to: location.pathname })
      }

      if (segments[2] === 'resources' && segments[3]) {
        items.push({ label: 'Resource', to: location.pathname })
      }

      return items
    }

    return [{ label: 'Agent', to: '/agent' }]
  }, [location.pathname])

  const currentPageTitle = breadcrumbs[breadcrumbs.length - 1]?.label ?? 'Servers'

  return (
    <div className={`dashboard-shell${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}>
      <aside
        className={[
          'sidebar',
          sidebarCollapsed ? 'is-collapsed' : '',
          mobileSidebarOpen ? 'is-mobile-open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="sidebar-header">
          <Link className="brand" to="/servers" onClick={() => setMobileSidebarOpen(false)}>
            <span className="brand-mark">M</span>
            {!sidebarCollapsed ? (
              <span className="brand-copy">
                <strong>MCP Inspector</strong>
                <span>Control center</span>
              </span>
            ) : null}
          </Link>

          <button
            className="icon-button sidebar-collapse-button"
            type="button"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? '>' : '<'}
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navigationItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileSidebarOpen(false)}
              className={({ isActive }) =>
                ['sidebar-link', isActive ? 'is-active' : ''].filter(Boolean).join(' ')
              }
              end={item.to === '/servers'}
            >
              <span className="sidebar-link-icon" aria-hidden="true">
                {item.icon}
              </span>
              {!sidebarCollapsed ? <span>{item.label}</span> : null}
            </NavLink>
          ))}
        </nav>
      </aside>

      {mobileSidebarOpen ? (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileSidebarOpen(false)}
        />
      ) : null}

      <div className="dashboard-main">
        <header className="topbar">
          <div className="topbar-main">
            <button
              className="icon-button mobile-nav-button"
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileSidebarOpen(true)}
            >
              =
            </button>

            <div>
              <div className="app-kicker">MCP Inspector</div>
              <div className="breadcrumb-row" aria-label="Breadcrumb">
                {breadcrumbs.map((item, index) => (
                  <span key={item.to} className="breadcrumb-item">
                    {index > 0 ? <span className="breadcrumb-separator">/</span> : null}
                    {index === breadcrumbs.length - 1 ? (
                      <span>{item.label}</span>
                    ) : (
                      <Link className="breadcrumb-link" to={item.to}>
                        {item.label}
                      </Link>
                    )}
                  </span>
                ))}
              </div>
              <h1 className="page-title">{currentPageTitle}</h1>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="status-chip" aria-live="polite">
              <span className={health ? 'status-dot is-healthy' : 'status-dot'} />
              <span>{health ? `${health.name} ${health.version}` : healthError || 'Backend unavailable'}</span>
            </div>

            <button className="theme-toggle" type="button" onClick={toggleTheme}>
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
