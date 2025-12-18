import { useState, useEffect, useCallback, useRef } from 'react'
import { AppProvider, useAppDispatch, useAppState } from './context/AppContext'
import { StatusBar, TranscriptDisplay, HistoryView, SettingsPanel, ErrorNotification } from './components'
import { useAudioCapture } from './hooks/useAudioCapture'
import { useWebSocket, TranscriptMessage } from './hooks/useWebSocket'
import type { VolumeDecision } from '../../shared/types'

/**
 * Inner App component that uses hooks and context
 * This is separated from the outer App to allow hooks to access AppProvider context
 */
function AppContent(): JSX.Element {
  const [activeTab, setActiveTab] = useState<'live' | 'history' | 'settings'>('live')
  const dispatch = useAppDispatch()
  const state = useAppState()
  
  // Session ID for grouping transcripts - persists for the lifetime of the app
  const sessionIdRef = useRef<string>(`session-${Date.now()}`)
  
  // Initialize hooks
  const audioCapture = useAudioCapture()
  const webSocket = useWebSocket()

  /**
   * Load settings from main process on startup
   * Requirements: 7.4 - Restore previously saved settings on restart
   */
  useEffect(() => {
    const loadSettings = async (): Promise<void> => {
      try {
        const settings = await window.electronAPI.settings.get()
        dispatch({ type: 'SETTINGS_UPDATE', settings })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load settings'
        dispatch({
          type: 'ERROR_ADD',
          error: { message, severity: 'error' }
        })
      }
    }
    loadSettings()
  }, [dispatch])

  /**
   * Load available audio devices on startup
   * Requirements: 1.4 - Allow user to select desired microphone device
   */
  useEffect(() => {
    const loadDevices = async (): Promise<void> => {
      try {
        const devices = await audioCapture.getDevices()
        dispatch({ type: 'AUDIO_DEVICES_UPDATE', devices })
      } catch (err) {
        console.error('Failed to load audio devices:', err)
      }
    }
    loadDevices()
  }, [audioCapture, dispatch])

  /**
   * Connect to WebSocket server when settings are loaded
   * Requirements: 2.1 - Establish WebSocket connection on app start
   */
  useEffect(() => {
    if (state.settings.serverUrl) {
      webSocket.connect({
        url: state.settings.serverUrl,
        reconnectAttempts: 5,
        reconnectBaseDelay: 1000
      })
    }
    
    return () => {
      webSocket.disconnect()
    }
  }, [state.settings.serverUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Sync WebSocket state to app context
   */
  useEffect(() => {
    dispatch({ type: 'CONNECTION_STATUS_CHANGE', status: webSocket.state.status })
    if (webSocket.state.lastError) {
      dispatch({ type: 'CONNECTION_ERROR', error: webSocket.state.lastError })
    }
    dispatch({ type: 'CONNECTION_RECONNECT_COUNT', count: webSocket.state.reconnectCount })
  }, [webSocket.state, dispatch])

  /**
   * Sync audio capture state to app context
   */
  useEffect(() => {
    if (audioCapture.state.isCapturing && audioCapture.state.currentDevice) {
      dispatch({ type: 'AUDIO_START', device: audioCapture.state.currentDevice })
    } else if (!audioCapture.state.isCapturing) {
      dispatch({ type: 'AUDIO_STOP' })
    }
    dispatch({ type: 'AUDIO_LEVEL_UPDATE', level: audioCapture.state.audioLevel })
  }, [audioCapture.state, dispatch])

  /**
   * Handle volume decisions from WebSocket
   * Requirements: 3.1, 3.2 - Adjust volume based on decisions
   */
  const handleVolumeDecision = useCallback(async (decision: VolumeDecision): Promise<void> => {
    try {
      if (decision === 'LOWER_VOLUME') {
        await window.electronAPI.volume.dim(state.settings.dimLevel)
      } else if (decision === 'RESTORE_VOLUME') {
        await window.electronAPI.volume.restore()
      }
      
      // Update volume status in state
      const status = await window.electronAPI.volume.getStatus()
      dispatch({ type: 'VOLUME_UPDATE', status })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to adjust volume'
      dispatch({
        type: 'ERROR_ADD',
        error: { message, severity: 'error' }
      })
    }
  }, [state.settings.dimLevel, dispatch])

  /**
   * Handle transcript messages from WebSocket
   * Requirements: 4.1 - Render transcript within 50ms of receipt
   * Requirements: 5.1 - Persist transcript to database
   */
  const handleTranscript = useCallback(async (transcript: TranscriptMessage): Promise<void> => {
    // Add to live transcript display - immediate for <50ms requirement
    dispatch({ type: 'TRANSCRIPT_ADD', entry: transcript })
    
    // Persist to database asynchronously
    // Use the session ID ref to group transcripts from the same session
    try {
      await window.electronAPI.history.save({
        sessionId: sessionIdRef.current,
        text: transcript.text,
        timestamp: transcript.timestamp,
        triggerPhrase: transcript.triggerPhrase,
        decision: transcript.decision
      })
    } catch (err) {
      console.error('Failed to save transcript to history:', err)
    }
  }, [dispatch])

  /**
   * Register WebSocket callbacks for volume decisions and transcripts
   * These callbacks handle incoming messages from the backend
   */
  useEffect(() => {
    webSocket.onDecision(handleVolumeDecision)
    webSocket.onTranscript(handleTranscript)
  }, [webSocket, handleVolumeDecision, handleTranscript])

  /**
   * Wire audio capture to WebSocket streaming
   * Requirements: 1.2 - Continuously stream audio data in real-time
   * Requirements: 2.2 - Stream raw audio data to backend continuously while connected
   * 
   * This effect registers a callback that forwards captured audio data to the WebSocket.
   * The callback checks connection status before sending to handle start/stop synchronization.
   */
  const webSocketStatusRef = useRef(webSocket.state.status)
  
  // Keep the ref updated with current WebSocket status
  useEffect(() => {
    webSocketStatusRef.current = webSocket.state.status
  }, [webSocket.state.status])
  
  // Register audio data callback - uses ref to avoid stale closure issues
  useEffect(() => {
    audioCapture.onAudioData((data: Float32Array) => {
      // Only send audio when WebSocket is connected
      // Using ref to get current status without causing re-registration
      if (webSocketStatusRef.current === 'connected') {
        webSocket.sendAudio(data)
      }
    })
  }, [audioCapture, webSocket])

  /**
   * Start audio capture when connected and device is selected
   */
  const startAudioCapture = useCallback(async (): Promise<void> => {
    const deviceId = state.settings.selectedDeviceId || ''
    try {
      await audioCapture.startCapture({ deviceId })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start audio capture'
      dispatch({
        type: 'ERROR_ADD',
        error: { message, severity: 'error' }
      })
    }
  }, [audioCapture, state.settings.selectedDeviceId, dispatch])

  /**
   * Auto-start audio capture when WebSocket connects
   */
  useEffect(() => {
    if (webSocket.state.status === 'connected' && !audioCapture.state.isCapturing) {
      startAudioCapture()
    }
  }, [webSocket.state.status]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Load initial volume status
   */
  useEffect(() => {
    const loadVolumeStatus = async (): Promise<void> => {
      try {
        const status = await window.electronAPI.volume.getStatus()
        dispatch({ type: 'VOLUME_UPDATE', status })
      } catch (err) {
        console.error('Failed to load volume status:', err)
      }
    }
    loadVolumeStatus()
  }, [dispatch])

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <header className="flex-shrink-0 bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Smart Volume Control</h1>
          {/* Audio capture toggle */}
          <button
            onClick={() => {
              if (audioCapture.state.isCapturing) {
                audioCapture.stopCapture()
              } else {
                startAudioCapture()
              }
            }}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              audioCapture.state.isCapturing
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {audioCapture.state.isCapturing ? 'Stop Capture' : 'Start Capture'}
          </button>
        </div>
      </header>

      {/* Status Bar */}
      <StatusBar />

      {/* Navigation */}
      <nav className="flex-shrink-0 bg-gray-800 border-b border-gray-700">
        <div className="flex space-x-1 px-4">
          <button
            onClick={() => setActiveTab('live')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
              activeTab === 'live'
                ? 'bg-gray-900 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            Live
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
              activeTab === 'history'
                ? 'bg-gray-900 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            History
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
              activeTab === 'settings'
                ? 'bg-gray-900 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            Settings
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'live' && <TranscriptDisplay />}
        {activeTab === 'history' && <HistoryView />}
        {activeTab === 'settings' && <SettingsPanel />}
      </main>

      {/* Error Notifications */}
      <ErrorNotification />
    </div>
  )
}

/**
 * Main App component
 * Wraps the application with AppProvider for state management
 */
function App(): JSX.Element {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}

export default App
