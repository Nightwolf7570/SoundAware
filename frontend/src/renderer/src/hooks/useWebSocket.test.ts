import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWebSocket, calculateBackoffDelay, float32ArrayToBase64 } from './useWebSocket'

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  url: string
  readyState: number = MockWebSocket.CONNECTING
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  private static instances: MockWebSocket[] = []

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) {
      this.onclose(new CloseEvent('close'))
    }
  })

  // Helper methods for testing
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    if (this.onopen) {
      this.onopen(new Event('open'))
    }
  }

  simulateMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }))
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'))
    }
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) {
      this.onclose(new CloseEvent('close'))
    }
  }

  static getLastInstance(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1]
  }

  static clearInstances() {
    MockWebSocket.instances = []
  }
}

describe('calculateBackoffDelay', () => {
  it('should return base delay for first attempt (attempt 0)', () => {
    expect(calculateBackoffDelay(1000, 0)).toBe(1000)
  })

  it('should double delay for each subsequent attempt', () => {
    expect(calculateBackoffDelay(1000, 1)).toBe(2000)
    expect(calculateBackoffDelay(1000, 2)).toBe(4000)
    expect(calculateBackoffDelay(1000, 3)).toBe(8000)
  })

  it('should work with different base delays', () => {
    expect(calculateBackoffDelay(500, 0)).toBe(500)
    expect(calculateBackoffDelay(500, 1)).toBe(1000)
    expect(calculateBackoffDelay(500, 2)).toBe(2000)
  })
})

describe('float32ArrayToBase64', () => {
  it('should convert Float32Array to base64 string', () => {
    const data = new Float32Array([0.1, 0.2, 0.3])
    const result = float32ArrayToBase64(data)
    
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('should handle empty array', () => {
    const data = new Float32Array(0)
    const result = float32ArrayToBase64(data)
    
    expect(typeof result).toBe('string')
  })

  it('should produce consistent output for same input', () => {
    const data = new Float32Array([0.5, -0.5, 1.0])
    const result1 = float32ArrayToBase64(data)
    const result2 = float32ArrayToBase64(data)
    
    expect(result1).toBe(result2)
  })
})

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', MockWebSocket)
    MockWebSocket.clearInstances()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('should initialize with disconnected state', () => {
    const { result } = renderHook(() => useWebSocket())

    expect(result.current.state.status).toBe('disconnected')
    expect(result.current.state.reconnectCount).toBe(0)
    expect(result.current.state.lastError).toBeNull()
  })

  it('should transition to connecting when connect is called', () => {
    const { result } = renderHook(() => useWebSocket())

    act(() => {
      result.current.connect({ url: 'ws://localhost:8080' })
    })

    expect(result.current.state.status).toBe('connecting')
  })

  it('should transition to connected when WebSocket opens', () => {
    const { result } = renderHook(() => useWebSocket())

    act(() => {
      result.current.connect({ url: 'ws://localhost:8080' })
    })

    const ws = MockWebSocket.getLastInstance()
    act(() => {
      ws?.simulateOpen()
    })

    expect(result.current.state.status).toBe('connected')
    expect(result.current.state.reconnectCount).toBe(0)
    expect(result.current.state.lastError).toBeNull()
  })

  it('should handle disconnect', () => {
    const { result } = renderHook(() => useWebSocket())

    act(() => {
      result.current.connect({ url: 'ws://localhost:8080' })
    })

    const ws = MockWebSocket.getLastInstance()
    act(() => {
      ws?.simulateOpen()
    })

    act(() => {
      result.current.disconnect()
    })

    expect(result.current.state.status).toBe('disconnected')
    expect(ws?.close).toHaveBeenCalled()
  })

  it('should send audio data when connected', () => {
    const { result } = renderHook(() => useWebSocket())

    act(() => {
      result.current.connect({ url: 'ws://localhost:8080' })
    })

    const ws = MockWebSocket.getLastInstance()
    act(() => {
      ws?.simulateOpen()
    })

    const audioData = new Float32Array([0.1, 0.2, 0.3])
    act(() => {
      result.current.sendAudio(audioData)
    })

    expect(ws?.send).toHaveBeenCalled()
    const sentData = JSON.parse(ws?.send.mock.calls[0][0])
    expect(sentData.type).toBe('audio')
    expect(sentData.data).toBeDefined()
    expect(sentData.timestamp).toBeDefined()
    expect(sentData.sampleRate).toBe(16000)
  })

  it('should not send audio when disconnected', () => {
    const { result } = renderHook(() => useWebSocket())

    const audioData = new Float32Array([0.1, 0.2, 0.3])
    act(() => {
      result.current.sendAudio(audioData)
    })

    // No WebSocket instance should exist
    const ws = MockWebSocket.getLastInstance()
    expect(ws).toBeUndefined()
  })

  it('should dispatch volume decisions to callback', () => {
    const { result } = renderHook(() => useWebSocket())
    const decisionCallback = vi.fn()

    act(() => {
      result.current.onDecision(decisionCallback)
      result.current.connect({ url: 'ws://localhost:8080' })
    })

    const ws = MockWebSocket.getLastInstance()
    act(() => {
      ws?.simulateOpen()
    })

    act(() => {
      ws?.simulateMessage({
        type: 'decision',
        decision: 'LOWER_VOLUME',
        confidence: 0.95,
        triggerPhrase: 'Hey'
      })
    })

    expect(decisionCallback).toHaveBeenCalledWith('LOWER_VOLUME')
  })

  it('should dispatch transcript messages to callback', () => {
    const { result } = renderHook(() => useWebSocket())
    const transcriptCallback = vi.fn()

    act(() => {
      result.current.onTranscript(transcriptCallback)
      result.current.connect({ url: 'ws://localhost:8080' })
    })

    const ws = MockWebSocket.getLastInstance()
    act(() => {
      ws?.simulateOpen()
    })

    act(() => {
      ws?.simulateMessage({
        type: 'transcript',
        id: 'msg-1',
        text: 'Hello there',
        timestamp: 1234567890,
        isFinal: true
      })
    })

    expect(transcriptCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'msg-1',
        text: 'Hello there',
        timestamp: 1234567890
      })
    )
  })

  it('should attempt reconnection with exponential backoff on connection loss', () => {
    const { result } = renderHook(() => useWebSocket())

    act(() => {
      result.current.connect({
        url: 'ws://localhost:8080',
        reconnectAttempts: 5,
        reconnectBaseDelay: 1000
      })
    })

    const ws = MockWebSocket.getLastInstance()
    act(() => {
      ws?.simulateOpen()
    })

    // Simulate connection loss
    act(() => {
      ws?.simulateClose()
    })

    expect(result.current.state.status).toBe('reconnecting')
    expect(result.current.state.reconnectCount).toBe(1)

    // Advance timer for first reconnect (1000ms)
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // A new WebSocket should be created
    const ws2 = MockWebSocket.getLastInstance()
    expect(ws2).not.toBe(ws)
  })

  it('should stop reconnecting after max attempts', () => {
    const { result } = renderHook(() => useWebSocket())

    act(() => {
      result.current.connect({
        url: 'ws://localhost:8080',
        reconnectAttempts: 2,
        reconnectBaseDelay: 100
      })
    })

    // Simulate multiple connection failures
    for (let i = 0; i < 3; i++) {
      const ws = MockWebSocket.getLastInstance()
      act(() => {
        ws?.simulateClose()
      })
      
      if (i < 2) {
        // Advance timer for reconnect
        act(() => {
          vi.advanceTimersByTime(100 * Math.pow(2, i))
        })
      }
    }

    expect(result.current.state.status).toBe('disconnected')
    expect(result.current.state.reconnectCount).toBe(3)
    expect(result.current.state.lastError).toContain('Unable to connect')
  })

  it('should not reconnect after manual disconnect', () => {
    const { result } = renderHook(() => useWebSocket())

    act(() => {
      result.current.connect({ url: 'ws://localhost:8080' })
    })

    const ws = MockWebSocket.getLastInstance()
    act(() => {
      ws?.simulateOpen()
    })

    act(() => {
      result.current.disconnect()
    })

    expect(result.current.state.status).toBe('disconnected')
    expect(result.current.state.reconnectCount).toBe(0)
    
    // Advance timers - no reconnection should happen
    act(() => {
      vi.advanceTimersByTime(10000)
    })

    expect(result.current.state.status).toBe('disconnected')
  })

  it('should handle invalid JSON messages gracefully', () => {
    const { result } = renderHook(() => useWebSocket())
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    act(() => {
      result.current.connect({ url: 'ws://localhost:8080' })
    })

    const ws = MockWebSocket.getLastInstance()
    act(() => {
      ws?.simulateOpen()
    })

    // Send invalid JSON
    act(() => {
      if (ws?.onmessage) {
        ws.onmessage(new MessageEvent('message', { data: 'invalid json' }))
      }
    })

    // Should not crash, just log error
    expect(consoleError).toHaveBeenCalled()
    expect(result.current.state.status).toBe('connected')

    consoleError.mockRestore()
  })

  it('should clean up on unmount', () => {
    const { result, unmount } = renderHook(() => useWebSocket())

    act(() => {
      result.current.connect({ url: 'ws://localhost:8080' })
    })

    const ws = MockWebSocket.getLastInstance()
    act(() => {
      ws?.simulateOpen()
    })

    unmount()

    expect(ws?.close).toHaveBeenCalled()
  })
})
