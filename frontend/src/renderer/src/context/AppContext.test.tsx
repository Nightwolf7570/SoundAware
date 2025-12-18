import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { 
  appReducer, 
  initialState, 
  AppProvider, 
  useAppContext,
  useAppState,
  useAppDispatch,
  AppState,
  AppAction
} from './AppContext'
import type { VolumeStatus } from '../../../shared/types'
import type { TranscriptMessage } from '../hooks/useWebSocket'
import React from 'react'

describe('appReducer', () => {
  describe('AUDIO actions', () => {
    it('should handle AUDIO_START', () => {
      const device = { deviceId: 'test-device', label: 'Test Mic' } as MediaDeviceInfo
      const action: AppAction = { type: 'AUDIO_START', device }
      
      const newState = appReducer(initialState, action)
      
      expect(newState.audio.isCapturing).toBe(true)
      expect(newState.audio.currentDevice).toBe(device)
    })

    it('should handle AUDIO_STOP', () => {
      const startedState: AppState = {
        ...initialState,
        audio: {
          ...initialState.audio,
          isCapturing: true,
          currentDevice: { deviceId: 'test' } as MediaDeviceInfo,
          audioLevel: 50
        }
      }
      const action: AppAction = { type: 'AUDIO_STOP' }
      
      const newState = appReducer(startedState, action)
      
      expect(newState.audio.isCapturing).toBe(false)
      expect(newState.audio.currentDevice).toBeNull()
      expect(newState.audio.audioLevel).toBe(0)
    })

    it('should handle AUDIO_LEVEL_UPDATE', () => {
      const action: AppAction = { type: 'AUDIO_LEVEL_UPDATE', level: 75 }
      
      const newState = appReducer(initialState, action)
      
      expect(newState.audio.audioLevel).toBe(75)
    })

    it('should handle AUDIO_DEVICES_UPDATE', () => {
      const devices = [
        { deviceId: 'device1', label: 'Mic 1' },
        { deviceId: 'device2', label: 'Mic 2' }
      ] as MediaDeviceInfo[]
      const action: AppAction = { type: 'AUDIO_DEVICES_UPDATE', devices }
      
      const newState = appReducer(initialState, action)
      
      expect(newState.audio.availableDevices).toEqual(devices)
    })
  })


  describe('CONNECTION actions', () => {
    it('should handle CONNECTION_STATUS_CHANGE to connected', () => {
      const stateWithError: AppState = {
        ...initialState,
        connection: {
          status: 'reconnecting',
          reconnectCount: 3,
          lastError: 'Connection lost'
        }
      }
      const action: AppAction = { type: 'CONNECTION_STATUS_CHANGE', status: 'connected' }
      
      const newState = appReducer(stateWithError, action)
      
      expect(newState.connection.status).toBe('connected')
      expect(newState.connection.lastError).toBeNull()
      expect(newState.connection.reconnectCount).toBe(0)
    })

    it('should handle CONNECTION_STATUS_CHANGE to disconnected', () => {
      const action: AppAction = { type: 'CONNECTION_STATUS_CHANGE', status: 'disconnected' }
      
      const newState = appReducer(initialState, action)
      
      expect(newState.connection.status).toBe('disconnected')
    })

    it('should handle CONNECTION_ERROR', () => {
      const action: AppAction = { type: 'CONNECTION_ERROR', error: 'Network error' }
      
      const newState = appReducer(initialState, action)
      
      expect(newState.connection.lastError).toBe('Network error')
    })

    it('should handle CONNECTION_RECONNECT_COUNT', () => {
      const action: AppAction = { type: 'CONNECTION_RECONNECT_COUNT', count: 2 }
      
      const newState = appReducer(initialState, action)
      
      expect(newState.connection.reconnectCount).toBe(2)
    })
  })

  describe('VOLUME actions', () => {
    it('should handle VOLUME_UPDATE', () => {
      const status: VolumeStatus = {
        currentLevel: 20,
        previousLevel: 80,
        state: 'dimmed'
      }
      const action: AppAction = { type: 'VOLUME_UPDATE', status }
      
      const newState = appReducer(initialState, action)
      
      expect(newState.volume.currentLevel).toBe(20)
      expect(newState.volume.previousLevel).toBe(80)
      expect(newState.volume.state).toBe('dimmed')
    })
  })

  describe('TRANSCRIPT actions', () => {
    it('should handle TRANSCRIPT_ADD', () => {
      const entry: TranscriptMessage = {
        id: 'msg-1',
        text: 'Hello there',
        timestamp: Date.now(),
        triggerPhrase: 'Hello',
        decision: 'LOWER_VOLUME'
      }
      const action: AppAction = { type: 'TRANSCRIPT_ADD', entry }
      
      const newState = appReducer(initialState, action)
      
      expect(newState.transcript.entries).toHaveLength(1)
      expect(newState.transcript.entries[0]).toEqual(entry)
    })

    it('should handle TRANSCRIPT_CLEAR', () => {
      const stateWithEntries: AppState = {
        ...initialState,
        transcript: {
          entries: [
            { id: '1', text: 'Test', timestamp: 1, triggerPhrase: null, decision: null }
          ],
          isAutoScrollEnabled: true
        }
      }
      const action: AppAction = { type: 'TRANSCRIPT_CLEAR' }
      
      const newState = appReducer(stateWithEntries, action)
      
      expect(newState.transcript.entries).toHaveLength(0)
    })

    it('should handle TRANSCRIPT_TOGGLE_AUTOSCROLL', () => {
      const action: AppAction = { type: 'TRANSCRIPT_TOGGLE_AUTOSCROLL' }
      
      const newState = appReducer(initialState, action)
      
      expect(newState.transcript.isAutoScrollEnabled).toBe(false)
      
      const toggledBack = appReducer(newState, action)
      expect(toggledBack.transcript.isAutoScrollEnabled).toBe(true)
    })
  })


  describe('SETTINGS actions', () => {
    it('should handle SETTINGS_UPDATE with partial settings', () => {
      const action: AppAction = { 
        type: 'SETTINGS_UPDATE', 
        settings: { dimLevel: 30, serverUrl: 'ws://new-server:9000' } 
      }
      
      const newState = appReducer(initialState, action)
      
      expect(newState.settings.dimLevel).toBe(30)
      expect(newState.settings.serverUrl).toBe('ws://new-server:9000')
      // Other settings should remain unchanged
      expect(newState.settings.transitionDuration).toBe(initialState.settings.transitionDuration)
    })
  })

  describe('ERROR actions', () => {
    it('should handle ERROR_ADD', () => {
      const action: AppAction = { 
        type: 'ERROR_ADD', 
        error: { message: 'Something went wrong', severity: 'error' } 
      }
      
      const newState = appReducer(initialState, action)
      
      expect(newState.errors).toHaveLength(1)
      expect(newState.errors[0].message).toBe('Something went wrong')
      expect(newState.errors[0].severity).toBe('error')
      expect(newState.errors[0].id).toBeDefined()
      expect(newState.errors[0].timestamp).toBeDefined()
    })

    it('should handle ERROR_DISMISS', () => {
      const stateWithErrors: AppState = {
        ...initialState,
        errors: [
          { id: 'err-1', message: 'Error 1', severity: 'error', timestamp: 1 },
          { id: 'err-2', message: 'Error 2', severity: 'warning', timestamp: 2 }
        ]
      }
      const action: AppAction = { type: 'ERROR_DISMISS', id: 'err-1' }
      
      const newState = appReducer(stateWithErrors, action)
      
      expect(newState.errors).toHaveLength(1)
      expect(newState.errors[0].id).toBe('err-2')
    })

    it('should handle ERROR_CLEAR_ALL', () => {
      const stateWithErrors: AppState = {
        ...initialState,
        errors: [
          { id: 'err-1', message: 'Error 1', severity: 'error', timestamp: 1 },
          { id: 'err-2', message: 'Error 2', severity: 'warning', timestamp: 2 }
        ]
      }
      const action: AppAction = { type: 'ERROR_CLEAR_ALL' }
      
      const newState = appReducer(stateWithErrors, action)
      
      expect(newState.errors).toHaveLength(0)
    })
  })

  it('should return current state for unknown action', () => {
    const unknownAction = { type: 'UNKNOWN_ACTION' } as unknown as AppAction
    
    const newState = appReducer(initialState, unknownAction)
    
    expect(newState).toBe(initialState)
  })
})


describe('AppProvider and hooks', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AppProvider>{children}</AppProvider>
  )

  describe('useAppContext', () => {
    it('should provide state and dispatch', () => {
      const { result } = renderHook(() => useAppContext(), { wrapper })
      
      expect(result.current.state).toBeDefined()
      expect(result.current.dispatch).toBeDefined()
      expect(result.current.state.audio.isCapturing).toBe(false)
    })

    it('should throw error when used outside provider', () => {
      expect(() => {
        renderHook(() => useAppContext())
      }).toThrow('useAppContext must be used within an AppProvider')
    })
  })

  describe('useAppState', () => {
    it('should return the current state', () => {
      const { result } = renderHook(() => useAppState(), { wrapper })
      
      expect(result.current).toEqual(initialState)
    })
  })

  describe('useAppDispatch', () => {
    it('should return dispatch function that updates state', () => {
      const { result } = renderHook(() => {
        const state = useAppState()
        const dispatch = useAppDispatch()
        return { state, dispatch }
      }, { wrapper })
      
      act(() => {
        result.current.dispatch({ type: 'AUDIO_LEVEL_UPDATE', level: 42 })
      })
      
      expect(result.current.state.audio.audioLevel).toBe(42)
    })
  })

  describe('AppProvider with custom initial state', () => {
    it('should merge custom initial state', () => {
      const customWrapper = ({ children }: { children: React.ReactNode }) => (
        <AppProvider initialState={{ 
          audio: { ...initialState.audio, audioLevel: 50 } 
        }}>
          {children}
        </AppProvider>
      )
      
      const { result } = renderHook(() => useAppState(), { wrapper: customWrapper })
      
      expect(result.current.audio.audioLevel).toBe(50)
    })
  })
})
