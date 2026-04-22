import { createContext } from 'react'
import type { HealthResponse, ThemeMode } from '../types'

export type AppStateValue = {
  theme: ThemeMode
  toggleTheme: () => void
  health: HealthResponse | null
  healthError: string
}

export const AppStateContext = createContext<AppStateValue | null>(null)
