import { useState, useCallback, useRef, useEffect } from 'react'
import type { VolumeDecision } from '../../../shared/types'

/**
 * WebSocket connection status
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

/**
 * Configuration for WebSocket connection
 */
export interface WebSocketConfig {
  url: string
  reconnectAttempts?: number   // Default: 5
  reconnectBaseDelay?: number  // Default: 1000ms
}

/**
 * State of the WebSocket connection
 */
export interface WebSocketState {
  status: ConnectionStatus
  reconnectCount: number
  lastError: string | null
}

/**
 * Transcript message received from backend
 */
export interface TranscriptMessage {
  id: string
  text: string
  timestamp: number
  triggerPhrase: string | null
  decision: VolumeDecision | null
}

/**
 * Return type for the useWebSocket hook
 */
export interface UseWebSocketReturn {
  state: WebSocketState
  connect: (config: WebSocketConfig) => void
  disconnect: () => void
  sendAudio: (data: Float32Array) => void
  onDecision: (callback: (decision: VolumeDecision) => void) => void
  onTranscript: (callback: (transcript: TranscriptMessage) => void) => void
}

/**
 * Audio message sent to server
 */
interface AudioMessage {
  type: 'audio'
  data: string        // Base64 encoded Float32Array
  timestamp: number
  sampleRate: number
}

/**
 * Decision message from server
 */
interface DecisionMessage {
  type: 'decision'
  decision: VolumeDecision
  confidence: number
  triggerPhrase: string | null
}

/**
 * Transcript update message from server
 */
interface TranscriptUpdateMessage {
  type: 'transcript'
  id: string
  text: string
  timestamp: number
  isFinal: boolean
}

type ServerMessage = DecisionMessage | TranscriptUpdateMessage

const DEFAULT_RECONNECT_ATTEMPTS = 5
const DEFAULT_RECONNECT_BASE_DELAY = 1000
const DEFAULT_SAMPLE_RATE = 16000

/**
 * Calculate exponential backoff delay
 * delay = baseDelay * 2^attemptNumber
 */
export function calculateBackoffDelay(baseDelay: number, attemptNumber: number): number {
  return baseDelay * Math.pow(2, attemptNumber)
}

/**
 * Convert Float32Array to base64 string for transmission
 */
export function float32ArrayToBase64(data: Float32Array): string {
  const bytes = new Uint8Array(data.buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Custom hook for WebSocket communication with the backend
 * 
 * Requirements covered:
 * - 2.1: Establish WebSocket connection to backend server on app start
 * - 2.2: Stream raw audio data to backend continuously while connected
 * - 2.3: Process volume decisions within 100ms of receipt
 * - 2.4: Automatic reconnection with exponential backoff
 * - 2.5: Notify user after 5 failed reconnection attempts
 */
export function useWebSocket(): UseWebSocketReturn {
  const [state, setState] = useState<WebSocketState>({
    status: 'disconnected',
    reconnectCount: 0,
    lastError: null
  })

  // Refs for WebSocket and callbacks
  const wsRef = useRef<WebSocket | null>(null)
  const configRef = useRef<WebSocketConfig | null>(null)
  const decisionCallbackRef = useRef<((decision: VolumeDecision) => void) | null>(null)
  const transcriptCallbackRef = useRef<((transcript: TranscriptMessage) => void) | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isManualDisconnectRef = useRef(false)

  /**
   * Clear any pending reconnection timeout
   */
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])

  /**
   * Handle incoming WebSocket messages
   */
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: ServerMessage = JSON.parse(event.data)
      
      if (message.type === 'decision') {
        // Process volume decision - Requirement 2.3
        if (decisionCallbackRef.current) {
          decisionCallbackRef.current(message.decision)
        }
      } else if (message.type === 'transcript') {
        // Process transcript update
        if (transcriptCallbackRef.current) {
          const transcript: TranscriptMessage = {
            id: message.id,
            text: message.text,
            timestamp: message.timestamp,
            triggerPhrase: null,
            decision: null
          }
          transcriptCallbackRef.current(transcript)
        }
      }
    } catch (err) {
      // Log parse error but continue processing
      console.error('Failed to parse WebSocket message:', err)
    }
  }, [])

  /**
   * Attempt to reconnect with exponential backoff
   */
  const attemptReconnect = useCallback(() => {
    const config = configRef.current
    if (!config) return

    const maxAttempts = config.reconnectAttempts ?? DEFAULT_RECONNECT_ATTEMPTS
    const baseDelay = config.reconnectBaseDelay ?? DEFAULT_RECONNECT_BASE_DELAY

    setState(prev => {
      const newReconnectCount = prev.reconnectCount + 1
      
      if (newReconnectCount > maxAttempts) {
        // Requirement 2.5: Notify user after max attempts
        return {
          status: 'disconnected',
          reconnectCount: newReconnectCount,
          lastError: 'Unable to connect to server. Check your network and server URL.'
        }
      }

      // Schedule reconnection with exponential backoff
      const delay = calculateBackoffDelay(baseDelay, newReconnectCount - 1)
      
      reconnectTimeoutRef.current = setTimeout(() => {
        if (!isManualDisconnectRef.current && configRef.current) {
          // Attempt to reconnect
          connectInternal(configRef.current, newReconnectCount)
        }
      }, delay)

      return {
        status: 'reconnecting',
        reconnectCount: newReconnectCount,
        lastError: `Connection lost. Reconnecting... (attempt ${newReconnectCount}/${maxAttempts})`
      }
    })
  }, [])

  /**
   * Internal connect function that handles the actual WebSocket connection
   */
  const connectInternal = useCallback((config: WebSocketConfig, currentReconnectCount: number) => {
    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    setState(prev => ({
      ...prev,
      status: currentReconnectCount > 0 ? 'reconnecting' : 'connecting',
      lastError: null
    }))

    try {
      const ws = new WebSocket(config.url)
      wsRef.current = ws

      ws.onopen = () => {
        setState({
          status: 'connected',
          reconnectCount: 0,
          lastError: null
        })
      }

      ws.onmessage = handleMessage

      ws.onerror = () => {
        // Error will be followed by close event
        setState(prev => ({
          ...prev,
          lastError: 'WebSocket connection error'
        }))
      }

      ws.onclose = () => {
        wsRef.current = null
        
        // Only attempt reconnect if not manually disconnected
        if (!isManualDisconnectRef.current) {
          attemptReconnect()
        } else {
          setState({
            status: 'disconnected',
            reconnectCount: 0,
            lastError: null
          })
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create WebSocket connection'
      setState({
        status: 'disconnected',
        reconnectCount: currentReconnectCount,
        lastError: errorMessage
      })
    }
  }, [handleMessage, attemptReconnect])

  /**
   * Connect to WebSocket server
   * Requirement 2.1: Establish connection to backend server
   */
  const connect = useCallback((config: WebSocketConfig) => {
    configRef.current = config
    isManualDisconnectRef.current = false
    clearReconnectTimeout()
    connectInternal(config, 0)
  }, [connectInternal, clearReconnectTimeout])

  /**
   * Disconnect from WebSocket server
   */
  const disconnect = useCallback(() => {
    isManualDisconnectRef.current = true
    clearReconnectTimeout()
    
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    setState({
      status: 'disconnected',
      reconnectCount: 0,
      lastError: null
    })
  }, [clearReconnectTimeout])

  /**
   * Send audio data to backend
   * Requirement 2.2: Stream raw audio data continuously
   */
  const sendAudio = useCallback((data: Float32Array) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const message: AudioMessage = {
        type: 'audio',
        data: float32ArrayToBase64(data),
        timestamp: Date.now(),
        sampleRate: DEFAULT_SAMPLE_RATE
      }
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  /**
   * Register callback for volume decisions
   */
  const onDecision = useCallback((callback: (decision: VolumeDecision) => void) => {
    decisionCallbackRef.current = callback
  }, [])

  /**
   * Register callback for transcript updates
   */
  const onTranscript = useCallback((callback: (transcript: TranscriptMessage) => void) => {
    transcriptCallbackRef.current = callback
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isManualDisconnectRef.current = true
      clearReconnectTimeout()
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [clearReconnectTimeout])

  return {
    state,
    connect,
    disconnect,
    sendAudio,
    onDecision,
    onTranscript
  }
}
