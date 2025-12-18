import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { ElectronAPI } from '../shared/types'

const electronAPI: ElectronAPI = {
  // Volume control
  volume: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.VOLUME.GET),
    set: (level: number) => ipcRenderer.invoke(IPC_CHANNELS.VOLUME.SET, level),
    dim: (targetLevel: number) => ipcRenderer.invoke(IPC_CHANNELS.VOLUME.DIM, targetLevel),
    restore: () => ipcRenderer.invoke(IPC_CHANNELS.VOLUME.RESTORE),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.VOLUME.STATUS)
  },

  // Chat history
  history: {
    save: (entry) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY.SAVE, entry),
    query: (query) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY.QUERY, query),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY.DELETE, id),
    count: (query) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY.COUNT, query)
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET),
    set: (settings) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SET, settings)
  },

  // Platform
  platform: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.PLATFORM.GET)
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
