// Volume types
export type VolumeState = 'normal' | 'dimmed'
export type VolumeDecision = 'LOWER_VOLUME' | 'RESTORE_VOLUME'

export interface VolumeStatus {
  currentLevel: number
  previousLevel: number
  state: VolumeState
}

// Chat history types
export interface ChatHistoryEntry {
  id: string
  sessionId: string
  text: string
  timestamp: number
  triggerPhrase: string | null
  decision: VolumeDecision | null
}

export interface ChatHistoryQuery {
  startDate?: number
  endDate?: number
  searchText?: string
  limit?: number
  offset?: number
}

// Settings types
export interface AppSettings {
  serverUrl: string
  dimLevel: number
  selectedDeviceId: string | null
  transitionDuration: number
}

// Platform types
export type Platform = 'win32' | 'darwin' | 'linux'

// IPC API types
export interface ElectronAPI {
  volume: {
    get: () => Promise<number>
    set: (level: number) => Promise<void>
    dim: (targetLevel: number) => Promise<void>
    restore: () => Promise<void>
    getStatus: () => Promise<VolumeStatus>
  }
  history: {
    save: (entry: Omit<ChatHistoryEntry, 'id'>) => Promise<ChatHistoryEntry>
    query: (query: ChatHistoryQuery) => Promise<ChatHistoryEntry[]>
    delete: (id: string) => Promise<boolean>
    count: (query?: ChatHistoryQuery) => Promise<number>
  }
  settings: {
    get: () => Promise<AppSettings>
    set: (settings: Partial<AppSettings>) => Promise<void>
  }
  platform: {
    get: () => Promise<Platform>
  }
}

// Extend Window interface
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
