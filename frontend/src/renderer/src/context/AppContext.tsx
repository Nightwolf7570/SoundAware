import React, { createContext, useContext, useReducer, ReactNode } from 'react'
import type { 
  VolumeStatus, 
  VolumeState, 
  AppSettings 
} from '../../../shared/types'
import type { ConnectionStatus, TranscriptMessage } from '../hooks/useWebSocket'

/**
 * Application state structure
 * Requirements: 8.1, 8.2, 8.3
 */
export interface AppState {
  // Audio capture state
  audio: {
    isCapturing: boolean
    currentDevice: MediaDeviceInfo | null
    audioLevel: number
    availableDevices: MediaDeviceInfo[]
  }

  // WebSocket connection state
  connection: {
    status: ConnectionStatus
    reconnectCount: number
    lastError: string | null
  }

  // Volume state
  volume: {
    currentLevel: number
    previousLevel: number
    state: VolumeState
  }

  // Transcript state
  transcript: {
    entries: TranscriptMessage[]
    isAutoScrollEnabled: boolean
  }

  // Settings
  settings: AppSettings

  // Error notifications
  errors: ErrorNotification[]
}

/**
 * Error notification structure
 */
export interface ErrorNotification {
  id: string
  message: string
  severity: 'info' | 'warning' | 'error'
  timestamp: number
}


/**
 * All possible actions for the app reducer
 */
export type AppAction =
  | { type: 'AUDIO_START'; device: MediaDeviceInfo }
  | { type: 'AUDIO_STOP' }
  | { type: 'AUDIO_LEVEL_UPDATE'; level: number }
  | { type: 'AUDIO_DEVICES_UPDATE'; devices: MediaDeviceInfo[] }
  | { type: 'CONNECTION_STATUS_CHANGE'; status: ConnectionStatus }
  | { type: 'CONNECTION_ERROR'; error: string }
  | { type: 'CONNECTION_RECONNECT_COUNT'; count: number }
  | { type: 'VOLUME_UPDATE'; status: VolumeStatus }
  | { type: 'TRANSCRIPT_ADD'; entry: TranscriptMessage }
  | { type: 'TRANSCRIPT_CLEAR' }
  | { type: 'TRANSCRIPT_TOGGLE_AUTOSCROLL' }
  | { type: 'SETTINGS_UPDATE'; settings: Partial<AppSettings> }
  | { type: 'ERROR_ADD'; error: Omit<ErrorNotification, 'id' | 'timestamp'> }
  | { type: 'ERROR_DISMISS'; id: string }
  | { type: 'ERROR_CLEAR_ALL' }

/**
 * Default settings values
 */
const DEFAULT_SETTINGS: AppSettings = {
  serverUrl: 'ws://localhost:8080',
  dimLevel: 20,
  selectedDeviceId: null,
  transitionDuration: 200
}

/**
 * Initial application state
 */
export const initialState: AppState = {
  audio: {
    isCapturing: false,
    currentDevice: null,
    audioLevel: 0,
    availableDevices: []
  },
  connection: {
    status: 'disconnected',
    reconnectCount: 0,
    lastError: null
  },
  volume: {
    currentLevel: 100,
    previousLevel: 100,
    state: 'normal'
  },
  transcript: {
    entries: [],
    isAutoScrollEnabled: true
  },
  settings: DEFAULT_SETTINGS,
  errors: []
}

/**
 * Generate unique ID for error notifications
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}


/**
 * App state reducer
 * Handles all state transitions for the application
 */
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'AUDIO_START':
      return {
        ...state,
        audio: {
          ...state.audio,
          isCapturing: true,
          currentDevice: action.device
        }
      }

    case 'AUDIO_STOP':
      return {
        ...state,
        audio: {
          ...state.audio,
          isCapturing: false,
          currentDevice: null,
          audioLevel: 0
        }
      }

    case 'AUDIO_LEVEL_UPDATE':
      return {
        ...state,
        audio: {
          ...state.audio,
          audioLevel: action.level
        }
      }

    case 'AUDIO_DEVICES_UPDATE':
      return {
        ...state,
        audio: {
          ...state.audio,
          availableDevices: action.devices
        }
      }

    case 'CONNECTION_STATUS_CHANGE':
      return {
        ...state,
        connection: {
          ...state.connection,
          status: action.status,
          // Clear error when connected
          lastError: action.status === 'connected' ? null : state.connection.lastError,
          // Reset reconnect count when connected
          reconnectCount: action.status === 'connected' ? 0 : state.connection.reconnectCount
        }
      }

    case 'CONNECTION_ERROR':
      return {
        ...state,
        connection: {
          ...state.connection,
          lastError: action.error
        }
      }

    case 'CONNECTION_RECONNECT_COUNT':
      return {
        ...state,
        connection: {
          ...state.connection,
          reconnectCount: action.count
        }
      }

    case 'VOLUME_UPDATE':
      return {
        ...state,
        volume: {
          currentLevel: action.status.currentLevel,
          previousLevel: action.status.previousLevel,
          state: action.status.state
        }
      }

    case 'TRANSCRIPT_ADD':
      return {
        ...state,
        transcript: {
          ...state.transcript,
          entries: [...state.transcript.entries, action.entry]
        }
      }

    case 'TRANSCRIPT_CLEAR':
      return {
        ...state,
        transcript: {
          ...state.transcript,
          entries: []
        }
      }

    case 'TRANSCRIPT_TOGGLE_AUTOSCROLL':
      return {
        ...state,
        transcript: {
          ...state.transcript,
          isAutoScrollEnabled: !state.transcript.isAutoScrollEnabled
        }
      }

    case 'SETTINGS_UPDATE':
      return {
        ...state,
        settings: {
          ...state.settings,
          ...action.settings
        }
      }

    case 'ERROR_ADD':
      return {
        ...state,
        errors: [
          ...state.errors,
          {
            id: generateId(),
            message: action.error.message,
            severity: action.error.severity,
            timestamp: Date.now()
          }
        ]
      }

    case 'ERROR_DISMISS':
      return {
        ...state,
        errors: state.errors.filter(e => e.id !== action.id)
      }

    case 'ERROR_CLEAR_ALL':
      return {
        ...state,
        errors: []
      }

    default:
      return state
  }
}


/**
 * Context type definition
 */
interface AppContextType {
  state: AppState
  dispatch: React.Dispatch<AppAction>
}

/**
 * Create the context with undefined default
 */
const AppContext = createContext<AppContextType | undefined>(undefined)

/**
 * Props for the AppProvider component
 */
interface AppProviderProps {
  children: ReactNode
  initialState?: Partial<AppState>
}

/**
 * AppProvider component
 * Wraps the application and provides state management via context
 * 
 * Requirements:
 * - 8.1: Display current connection status (connected/disconnected/reconnecting)
 * - 8.2: Display audio level indicator when microphone is capturing
 * - 8.3: Display current volume level and state (normal/dimmed)
 */
export function AppProvider({ children, initialState: customInitialState }: AppProviderProps): JSX.Element {
  const mergedInitialState: AppState = customInitialState 
    ? { ...initialState, ...customInitialState }
    : initialState

  const [state, dispatch] = useReducer(appReducer, mergedInitialState)

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  )
}

/**
 * Custom hook to access the app context
 * Throws an error if used outside of AppProvider
 */
export function useAppContext(): AppContextType {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider')
  }
  return context
}

/**
 * Custom hook to access just the app state
 */
export function useAppState(): AppState {
  const { state } = useAppContext()
  return state
}

/**
 * Custom hook to access just the dispatch function
 */
export function useAppDispatch(): React.Dispatch<AppAction> {
  const { dispatch } = useAppContext()
  return dispatch
}

export { AppContext }
