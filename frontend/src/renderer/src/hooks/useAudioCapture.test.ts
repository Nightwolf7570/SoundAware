import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAudioCapture, calculateAudioLevel } from './useAudioCapture'

// Mock MediaDeviceInfo
const createMockDevice = (id: string, label: string): MediaDeviceInfo => ({
  deviceId: id,
  groupId: 'group-1',
  kind: 'audioinput',
  label,
  toJSON: () => ({})
})

// Mock MediaStream
const createMockMediaStream = (deviceId: string) => {
  const mockTrack = {
    stop: vi.fn(),
    getSettings: () => ({ deviceId }),
    kind: 'audio',
    id: 'track-1',
    label: 'Mock Track',
    enabled: true,
    muted: false,
    readyState: 'live'
  }
  return {
    getTracks: () => [mockTrack],
    getAudioTracks: () => [mockTrack],
    getVideoTracks: () => [],
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
    clone: vi.fn(),
    active: true,
    id: 'stream-1'
  } as unknown as MediaStream
}

// Mock AudioContext
const createMockAudioContext = () => {
  const mockAnalyser = {
    fftSize: 2048,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getFloatTimeDomainData: vi.fn((array: Float32Array) => {
      // Fill with some test data
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.sin(i * 0.1) * 0.5
      }
    })
  }

  const mockProcessor = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    onaudioprocess: null as ((event: AudioProcessingEvent) => void) | null
  }

  const mockSource = {
    connect: vi.fn()
  }

  return {
    createMediaStreamSource: vi.fn(() => mockSource),
    createAnalyser: vi.fn(() => mockAnalyser),
    createScriptProcessor: vi.fn(() => mockProcessor),
    destination: {},
    close: vi.fn(),
    sampleRate: 16000,
    state: 'running',
    mockAnalyser,
    mockProcessor,
    mockSource
  }
}

describe('calculateAudioLevel', () => {
  it('should return 0 for empty array', () => {
    const result = calculateAudioLevel(new Float32Array(0))
    expect(result).toBe(0)
  })

  it('should return 0 for silent audio (all zeros)', () => {
    const samples = new Float32Array(1024).fill(0)
    const result = calculateAudioLevel(samples)
    expect(result).toBe(0)
  })

  it('should return a value between 0 and 100', () => {
    const samples = new Float32Array(1024)
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(i * 0.1) * 0.5
    }
    const result = calculateAudioLevel(samples)
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(100)
  })

  it('should return higher values for louder audio', () => {
    const quietSamples = new Float32Array(1024)
    const loudSamples = new Float32Array(1024)
    
    for (let i = 0; i < 1024; i++) {
      quietSamples[i] = Math.sin(i * 0.1) * 0.1
      loudSamples[i] = Math.sin(i * 0.1) * 0.8
    }
    
    const quietLevel = calculateAudioLevel(quietSamples)
    const loudLevel = calculateAudioLevel(loudSamples)
    
    expect(loudLevel).toBeGreaterThan(quietLevel)
  })
})

describe('useAudioCapture', () => {
  let mockAudioContext: ReturnType<typeof createMockAudioContext>
  let mockDevices: MediaDeviceInfo[]
  let mockStream: MediaStream

  beforeEach(() => {
    mockDevices = [
      createMockDevice('device-1', 'AirPods Pro'),
      createMockDevice('device-2', 'Built-in Microphone')
    ]
    mockStream = createMockMediaStream('device-1')
    mockAudioContext = createMockAudioContext()

    // Mock navigator.mediaDevices
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        enumerateDevices: vi.fn().mockResolvedValue(mockDevices),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      },
      writable: true,
      configurable: true
    })

    // Mock AudioContext
    vi.stubGlobal('AudioContext', vi.fn(() => mockAudioContext))

    // Mock requestAnimationFrame
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => {
      // Don't actually call the callback to avoid infinite loops in tests
      return 1
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useAudioCapture())

    expect(result.current.state.isCapturing).toBe(false)
    expect(result.current.state.currentDevice).toBeNull()
    expect(result.current.state.audioLevel).toBe(0)
    expect(result.current.state.error).toBeNull()
  })

  it('should enumerate available devices', async () => {
    const { result } = renderHook(() => useAudioCapture())

    let devices: MediaDeviceInfo[] = []
    await act(async () => {
      devices = await result.current.getDevices()
    })

    expect(devices).toHaveLength(2)
    expect(devices[0].label).toBe('AirPods Pro')
    expect(result.current.state.availableDevices).toHaveLength(2)
  })

  it('should start capturing audio with specified device', async () => {
    const { result } = renderHook(() => useAudioCapture())

    await act(async () => {
      await result.current.startCapture({ deviceId: 'device-1' })
    })

    expect(result.current.state.isCapturing).toBe(true)
    expect(result.current.state.error).toBeNull()
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({
          deviceId: { exact: 'device-1' }
        })
      })
    )
  })

  it('should stop capturing and clean up resources', async () => {
    const { result } = renderHook(() => useAudioCapture())

    await act(async () => {
      await result.current.startCapture({ deviceId: 'device-1' })
    })

    expect(result.current.state.isCapturing).toBe(true)

    act(() => {
      result.current.stopCapture()
    })

    expect(result.current.state.isCapturing).toBe(false)
    expect(result.current.state.currentDevice).toBeNull()
    expect(result.current.state.audioLevel).toBe(0)
    expect(mockAudioContext.close).toHaveBeenCalled()
  })

  it('should handle permission denied error', async () => {
    const permissionError = new DOMException('Permission denied', 'NotAllowedError')
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(permissionError)

    const { result } = renderHook(() => useAudioCapture())

    await act(async () => {
      try {
        await result.current.startCapture({ deviceId: 'device-1' })
      } catch {
        // Expected to throw
      }
    })

    expect(result.current.state.isCapturing).toBe(false)
    expect(result.current.state.error).toBe(
      'Microphone access required. Please grant permission in system settings.'
    )
  })

  it('should handle device not found error', async () => {
    const notFoundError = new DOMException('Device not found', 'NotFoundError')
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(notFoundError)

    const { result } = renderHook(() => useAudioCapture())

    await act(async () => {
      try {
        await result.current.startCapture({ deviceId: 'invalid-device' })
      } catch {
        // Expected to throw
      }
    })

    expect(result.current.state.error).toBe(
      'Selected microphone not found. Please select another device.'
    )
  })

  it('should handle device in use error', async () => {
    const inUseError = new DOMException('Device in use', 'NotReadableError')
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(inUseError)

    const { result } = renderHook(() => useAudioCapture())

    await act(async () => {
      try {
        await result.current.startCapture({ deviceId: 'device-1' })
      } catch {
        // Expected to throw
      }
    })

    expect(result.current.state.error).toBe(
      'Microphone is in use by another application.'
    )
  })

  it('should register audio data callback', async () => {
    const { result } = renderHook(() => useAudioCapture())
    const mockCallback = vi.fn()

    act(() => {
      result.current.onAudioData(mockCallback)
    })

    await act(async () => {
      await result.current.startCapture({ deviceId: 'device-1' })
    })

    // Simulate audio processing event
    const mockEvent = {
      inputBuffer: {
        getChannelData: () => new Float32Array([0.1, 0.2, 0.3])
      }
    } as unknown as AudioProcessingEvent

    act(() => {
      if (mockAudioContext.mockProcessor.onaudioprocess) {
        mockAudioContext.mockProcessor.onaudioprocess(mockEvent)
      }
    })

    expect(mockCallback).toHaveBeenCalledWith(expect.any(Float32Array))
  })

  it('should clean up on unmount', async () => {
    const { result, unmount } = renderHook(() => useAudioCapture())

    await act(async () => {
      await result.current.startCapture({ deviceId: 'device-1' })
    })

    unmount()

    expect(mockAudioContext.close).toHaveBeenCalled()
  })
})
