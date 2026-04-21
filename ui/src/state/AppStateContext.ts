import { createContext } from 'react'
import type {
  HealthResponse,
  InspectFormState,
  InspectResponse,
  ServerRecord,
  ThemeMode,
} from '../types'

export type AppStateValue = {
  theme: ThemeMode
  toggleTheme: () => void
  health: HealthResponse | null
  healthError: string
  servers: ServerRecord[]
  isCreatingServer: boolean
  createServerError: string
  draftServer: InspectFormState
  updateDraftServer: (patch: Partial<InspectFormState>) => void
  createServer: () => Promise<string | null>
  reinspectServer: (serverId: string) => Promise<void>
  getServerById: (serverId: string) => ServerRecord | undefined
  inspectServer: (draft: InspectFormState) => Promise<InspectResponse>
}

export const AppStateContext = createContext<AppStateValue | null>(null)
