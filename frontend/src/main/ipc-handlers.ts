import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { getSettingsManager } from './services/settings-manager'
import { getVolumeController } from './services/volume-controller'
import { getChatHistoryRepository } from './services/chat-history-repository'
import { initializeDatabase } from './services/database'
import type {
  VolumeStatus,
  ChatHistoryEntry,
  ChatHistoryQuery,
  AppSettings,
  Platform
} from '../shared/types'

/**
 * Register all IPC handlers for the main process.
 * This function should be called after app is ready.
 */
export function registerIPCHandlers(): void {
  // Initialize database
  initializeDatabase()
  // Volume control handlers - Implemented with VolumeController (Task 4)
  ipcMain.handle(IPC_CHANNELS.VOLUME.GET, async (): Promise<number> => {
    const volumeController = getVolumeController()
    return volumeController.getVolume()
  })

  ipcMain.handle(IPC_CHANNELS.VOLUME.SET, async (_event: IpcMainInvokeEvent, level: number): Promise<void> => {
    const volumeController = getVolumeController()
    await volumeController.setVolume(level)
  })

  ipcMain.handle(IPC_CHANNELS.VOLUME.DIM, async (_event: IpcMainInvokeEvent, targetLevel: number): Promise<void> => {
    const volumeController = getVolumeController()
    await volumeController.dimVolume(targetLevel)
  })

  ipcMain.handle(IPC_CHANNELS.VOLUME.RESTORE, async (): Promise<void> => {
    const volumeController = getVolumeController()
    await volumeController.restoreVolume()
  })

  ipcMain.handle(IPC_CHANNELS.VOLUME.STATUS, async (): Promise<VolumeStatus> => {
    const volumeController = getVolumeController()
    return volumeController.getStatus()
  })

  // Chat history handlers - Implemented with ChatHistoryRepository (Task 5)
  ipcMain.handle(
    IPC_CHANNELS.HISTORY.SAVE,
    async (_event: IpcMainInvokeEvent, entry: Omit<ChatHistoryEntry, 'id'>): Promise<ChatHistoryEntry> => {
      const repository = getChatHistoryRepository()
      return repository.save(entry)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.HISTORY.QUERY,
    async (_event: IpcMainInvokeEvent, query: ChatHistoryQuery): Promise<ChatHistoryEntry[]> => {
      const repository = getChatHistoryRepository()
      return repository.findAll(query)
    }
  )

  ipcMain.handle(IPC_CHANNELS.HISTORY.DELETE, async (_event: IpcMainInvokeEvent, id: string): Promise<boolean> => {
    const repository = getChatHistoryRepository()
    return repository.delete(id)
  })

  ipcMain.handle(
    IPC_CHANNELS.HISTORY.COUNT,
    async (_event: IpcMainInvokeEvent, query?: ChatHistoryQuery): Promise<number> => {
      const repository = getChatHistoryRepository()
      return repository.count(query)
    }
  )

  // Settings handlers - Implemented with SettingsManager (Task 2)
  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET, async (): Promise<AppSettings> => {
    const settingsManager = getSettingsManager()
    return settingsManager.getAll()
  })

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS.SET,
    async (_event: IpcMainInvokeEvent, settings: Partial<AppSettings>): Promise<void> => {
      const settingsManager = getSettingsManager()
      settingsManager.setAll(settings)
    }
  )

  // Platform handler
  ipcMain.handle(IPC_CHANNELS.PLATFORM.GET, async (): Promise<Platform> => {
    return process.platform as Platform
  })
}
