import '@testing-library/jest-dom'

// Mock electron API for renderer tests
const mockElectronAPI = {
  volume: {
    get: vi.fn().mockResolvedValue(50),
    set: vi.fn().mockResolvedValue(undefined),
    dim: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({
      currentLevel: 50,
      previousLevel: 100,
      state: 'normal'
    })
  },
  history: {
    save: vi.fn().mockResolvedValue({ id: 'test-id' }),
    query: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
    count: vi.fn().mockResolvedValue(0)
  },
  settings: {
    get: vi.fn().mockResolvedValue({
      serverUrl: 'ws://localhost:8080',
      dimLevel: 20,
      selectedDeviceId: null,
      transitionDuration: 200
    }),
    set: vi.fn().mockResolvedValue(undefined)
  },
  platform: {
    get: vi.fn().mockResolvedValue('win32')
  }
}

// Only set up mock if window exists (renderer process tests)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'electronAPI', {
    value: mockElectronAPI,
    writable: true
  })
}

export { mockElectronAPI }
