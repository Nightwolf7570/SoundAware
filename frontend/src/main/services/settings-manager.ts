import Store from 'electron-store'
import type { AppSettings } from '../../shared/types'

/**
 * Interface for the Settings Manager
 * Provides type-safe access to application settings with persistence
 */
export interface ISettingsManager {
  get<K extends keyof AppSettings>(key: K): AppSettings[K]
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void
  getAll(): AppSettings
  setAll(settings: Partial<AppSettings>): void
  reset(): void
}

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: AppSettings = {
  serverUrl: 'ws://localhost:8080',
  dimLevel: 20,
  selectedDeviceId: null,
  transitionDuration: 200
}

/**
 * Schema for electron-store validation
 */
const settingsSchema = {
  serverUrl: {
    type: 'string' as const,
    default: DEFAULT_SETTINGS.serverUrl
  },
  dimLevel: {
    type: 'number' as const,
    minimum: 0,
    maximum: 100,
    default: DEFAULT_SETTINGS.dimLevel
  },
  selectedDeviceId: {
    type: ['string', 'null'] as const,
    default: DEFAULT_SETTINGS.selectedDeviceId
  },
  transitionDuration: {
    type: 'number' as const,
    minimum: 0,
    default: DEFAULT_SETTINGS.transitionDuration
  }
}

/**
 * Settings Manager implementation using electron-store
 * Provides persistent storage for application settings
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
export class SettingsManager implements ISettingsManager {
  private store: Store<AppSettings>

  constructor(storeName?: string) {
    this.store = new Store<AppSettings>({
      name: storeName || 'settings',
      schema: settingsSchema,
      defaults: DEFAULT_SETTINGS
    })
  }

  /**
   * Get a single setting value by key
   * @param key - The setting key to retrieve
   * @returns The setting value
   */
  get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.store.get(key)
  }

  /**
   * Set a single setting value
   * Changes are persisted immediately (Requirement 7.3)
   * @param key - The setting key to update
   * @param value - The new value
   */
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.store.set(key, value)
  }

  /**
   * Get all settings
   * @returns Complete AppSettings object
   */
  getAll(): AppSettings {
    return {
      serverUrl: this.store.get('serverUrl'),
      dimLevel: this.store.get('dimLevel'),
      selectedDeviceId: this.store.get('selectedDeviceId'),
      transitionDuration: this.store.get('transitionDuration')
    }
  }

  /**
   * Update multiple settings at once
   * Changes are persisted immediately (Requirement 7.3)
   * @param settings - Partial settings object with values to update
   */
  setAll(settings: Partial<AppSettings>): void {
    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined) {
        this.store.set(key as keyof AppSettings, value)
      }
    }
  }

  /**
   * Reset all settings to default values
   */
  reset(): void {
    this.store.clear()
  }

  /**
   * Get the path to the settings file (useful for testing/debugging)
   */
  getStorePath(): string {
    return this.store.path
  }
}

// Singleton instance for use throughout the application
let settingsManagerInstance: SettingsManager | null = null

/**
 * Get the singleton SettingsManager instance
 * Creates the instance on first call
 */
export function getSettingsManager(): SettingsManager {
  if (!settingsManagerInstance) {
    settingsManagerInstance = new SettingsManager()
  }
  return settingsManagerInstance
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetSettingsManagerInstance(): void {
  settingsManagerInstance = null
}
