import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from './App'

// Mock the electronAPI
const mockElectronAPI = {
  volume: {
    get: vi.fn().mockResolvedValue(100),
    set: vi.fn().mockResolvedValue(undefined),
    dim: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({ currentLevel: 100, previousLevel: 100, state: 'normal' })
  },
  history: {
    save: vi.fn().mockResolvedValue({ id: '1', sessionId: 's1', text: 'test', timestamp: Date.now(), triggerPhrase: null, decision: null }),
    query: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
    count: vi.fn().mockResolvedValue(0)
  },
  settings: {
    get: vi.fn().mockResolvedValue({ serverUrl: 'ws://localhost:8080', dimLevel: 20, selectedDeviceId: null, transitionDuration: 200 }),
    set: vi.fn().mockResolvedValue(undefined)
  },
  platform: {
    get: vi.fn().mockResolvedValue('win32')
  }
}

// Mock navigator.mediaDevices
const mockMediaDevices = {
  getUserMedia: vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }]
  }),
  enumerateDevices: vi.fn().mockResolvedValue([
    { deviceId: 'default', kind: 'audioinput', label: 'Default Microphone', groupId: 'default' }
  ]),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  // @ts-expect-error - mocking window.electronAPI
  window.electronAPI = mockElectronAPI
  
  // Mock navigator.mediaDevices
  Object.defineProperty(navigator, 'mediaDevices', {
    value: mockMediaDevices,
    writable: true,
    configurable: true
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App', () => {
  it('renders the application title', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Smart Volume Control')).toBeInTheDocument()
    })
  })

  it('renders navigation tabs', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument()
      expect(screen.getByText('History')).toBeInTheDocument()
      expect(screen.getByText('Settings')).toBeInTheDocument()
    })
  })
})
