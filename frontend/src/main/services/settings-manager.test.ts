import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AppSettings } from '../../shared/types'

// Mock electron-store for testing
const mockStore = new Map<string, unknown>()

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private defaults: AppSettings

      constructor(options: { defaults: AppSettings }) {
        this.defaults = options.defaults
        // Initialize with defaults if store is empty
        if (mockStore.size === 0) {
          for (const [key, value] of Object.entries(this.defaults)) {
            mockStore.set(key, value)
          }
        }
      }

      get<K extends keyof AppSettings>(key: K): AppSettings[K] {
        if (mockStore.has(key)) {
          return mockStore.get(key) as AppSettings[K]
        }
        return this.defaults[key]
      }

      set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
        mockStore.set(key, value)
      }

      clear(): void {
        mockStore.clear()
        // Re-initialize with defaults
        for (const [key, value] of Object.entries(this.defaults)) {
          mockStore.set(key, value)
        }
      }

      get path(): string {
        return '/mock/path/settings.json'
      }
    }
  }
})

// Import after mock is set up
import { SettingsManager, DEFAULT_SETTINGS, resetSettingsManagerInstance } from './settings-manager'

describe('SettingsManager', () => {
  let settingsManager: SettingsManager

  beforeEach(() => {
    mockStore.clear()
    resetSettingsManagerInstance()
    settingsManager = new SettingsManager('test-settings')
  })

  describe('default values', () => {
    it('should return default serverUrl', () => {
      expect(settingsManager.get('serverUrl')).toBe(DEFAULT_SETTINGS.serverUrl)
    })

    it('should return default dimLevel', () => {
      expect(settingsManager.get('dimLevel')).toBe(DEFAULT_SETTINGS.dimLevel)
    })

    it('should return default selectedDeviceId', () => {
      expect(settingsManager.get('selectedDeviceId')).toBe(DEFAULT_SETTINGS.selectedDeviceId)
    })

    it('should return default transitionDuration', () => {
      expect(settingsManager.get('transitionDuration')).toBe(DEFAULT_SETTINGS.transitionDuration)
    })
  })

  describe('get/set operations', () => {
    it('should set and get serverUrl', () => {
      const newUrl = 'ws://example.com:9090'
      settingsManager.set('serverUrl', newUrl)
      expect(settingsManager.get('serverUrl')).toBe(newUrl)
    })

    it('should set and get dimLevel', () => {
      const newLevel = 50
      settingsManager.set('dimLevel', newLevel)
      expect(settingsManager.get('dimLevel')).toBe(newLevel)
    })

    it('should set and get selectedDeviceId', () => {
      const deviceId = 'device-123'
      settingsManager.set('selectedDeviceId', deviceId)
      expect(settingsManager.get('selectedDeviceId')).toBe(deviceId)
    })

    it('should set and get transitionDuration', () => {
      const duration = 500
      settingsManager.set('transitionDuration', duration)
      expect(settingsManager.get('transitionDuration')).toBe(duration)
    })
  })

  describe('getAll', () => {
    it('should return all settings with defaults', () => {
      const allSettings = settingsManager.getAll()
      expect(allSettings).toEqual(DEFAULT_SETTINGS)
    })

    it('should return all settings after modifications', () => {
      settingsManager.set('serverUrl', 'ws://new-server.com')
      settingsManager.set('dimLevel', 75)

      const allSettings = settingsManager.getAll()
      expect(allSettings.serverUrl).toBe('ws://new-server.com')
      expect(allSettings.dimLevel).toBe(75)
      expect(allSettings.selectedDeviceId).toBe(DEFAULT_SETTINGS.selectedDeviceId)
      expect(allSettings.transitionDuration).toBe(DEFAULT_SETTINGS.transitionDuration)
    })
  })

  describe('setAll', () => {
    it('should update multiple settings at once', () => {
      settingsManager.setAll({
        serverUrl: 'ws://bulk-update.com',
        dimLevel: 30
      })

      expect(settingsManager.get('serverUrl')).toBe('ws://bulk-update.com')
      expect(settingsManager.get('dimLevel')).toBe(30)
    })

    it('should not modify settings not included in partial update', () => {
      const originalDuration = settingsManager.get('transitionDuration')
      
      settingsManager.setAll({
        serverUrl: 'ws://partial-update.com'
      })

      expect(settingsManager.get('transitionDuration')).toBe(originalDuration)
    })

    it('should ignore undefined values', () => {
      const originalUrl = settingsManager.get('serverUrl')
      
      settingsManager.setAll({
        serverUrl: undefined,
        dimLevel: 45
      })

      expect(settingsManager.get('serverUrl')).toBe(originalUrl)
      expect(settingsManager.get('dimLevel')).toBe(45)
    })
  })

  describe('reset', () => {
    it('should reset all settings to defaults', () => {
      // Modify settings
      settingsManager.set('serverUrl', 'ws://modified.com')
      settingsManager.set('dimLevel', 99)
      settingsManager.set('selectedDeviceId', 'some-device')
      settingsManager.set('transitionDuration', 1000)

      // Reset
      settingsManager.reset()

      // Verify defaults are restored
      expect(settingsManager.getAll()).toEqual(DEFAULT_SETTINGS)
    })
  })

  describe('persistence requirements', () => {
    it('should persist changes immediately (Requirement 7.3)', () => {
      // This test verifies that set() is called synchronously
      // In the real implementation, electron-store writes to disk immediately
      settingsManager.set('dimLevel', 42)
      
      // Create a new instance to simulate app restart
      const newManager = new SettingsManager('test-settings')
      expect(newManager.get('dimLevel')).toBe(42)
    })

    it('should restore settings after simulated restart (Requirement 7.4)', () => {
      // Set various settings
      settingsManager.set('serverUrl', 'ws://persistent.com')
      settingsManager.set('dimLevel', 55)
      settingsManager.set('selectedDeviceId', 'persistent-device')
      settingsManager.set('transitionDuration', 300)

      // Create new instance (simulating restart)
      const restoredManager = new SettingsManager('test-settings')

      // Verify all settings are restored
      expect(restoredManager.get('serverUrl')).toBe('ws://persistent.com')
      expect(restoredManager.get('dimLevel')).toBe(55)
      expect(restoredManager.get('selectedDeviceId')).toBe('persistent-device')
      expect(restoredManager.get('transitionDuration')).toBe(300)
    })
  })
})
