/**
 * IPC Channel definitions for type-safe communication between
 * main and renderer processes.
 */

export const IPC_CHANNELS = {
  // Volume control channels
  VOLUME: {
    GET: 'volume:get',
    SET: 'volume:set',
    DIM: 'volume:dim',
    RESTORE: 'volume:restore',
    STATUS: 'volume:status'
  },

  // Chat history channels
  HISTORY: {
    SAVE: 'history:save',
    QUERY: 'history:query',
    DELETE: 'history:delete',
    COUNT: 'history:count'
  },

  // Settings channels
  SETTINGS: {
    GET: 'settings:get',
    SET: 'settings:set'
  },

  // Platform channels
  PLATFORM: {
    GET: 'platform:get'
  }
} as const

// Type helper to extract channel names
export type VolumeChannel = typeof IPC_CHANNELS.VOLUME[keyof typeof IPC_CHANNELS.VOLUME]
export type HistoryChannel = typeof IPC_CHANNELS.HISTORY[keyof typeof IPC_CHANNELS.HISTORY]
export type SettingsChannel = typeof IPC_CHANNELS.SETTINGS[keyof typeof IPC_CHANNELS.SETTINGS]
export type PlatformChannel = typeof IPC_CHANNELS.PLATFORM[keyof typeof IPC_CHANNELS.PLATFORM]
export type IPCChannel = VolumeChannel | HistoryChannel | SettingsChannel | PlatformChannel
