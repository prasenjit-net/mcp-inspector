import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { DashboardLayout } from './components/DashboardLayout'
import { AgentPage } from './pages/AgentPage'
import { ResourceDetailPage } from './pages/ResourceDetailPage'
import { ServerDetailPage } from './pages/ServerDetailPage'
import { ServersPage } from './pages/ServersPage'
import { ToolDetailPage } from './pages/ToolDetailPage'
import { AppStateProvider } from './state/AppState'

function App() {
  return (
    <AppStateProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DashboardLayout />}>
            <Route index element={<Navigate to="/servers" replace />} />
            <Route path="servers" element={<ServersPage />} />
            <Route path="servers/:serverId" element={<ServerDetailPage />} />
            <Route path="servers/:serverId/tools/:toolName" element={<ToolDetailPage />} />
            <Route
              path="servers/:serverId/resources/:resourceId"
              element={<ResourceDetailPage />}
            />
            <Route path="agent" element={<AgentPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppStateProvider>
  )
}

export default App
