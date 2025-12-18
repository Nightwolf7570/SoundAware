"use strict";
const electron = require("electron");
const IPC_CHANNELS = {
  // Volume control channels
  VOLUME: {
    GET: "volume:get",
    SET: "volume:set",
    DIM: "volume:dim",
    RESTORE: "volume:restore",
    STATUS: "volume:status"
  },
  // Chat history channels
  HISTORY: {
    SAVE: "history:save",
    QUERY: "history:query",
    DELETE: "history:delete",
    COUNT: "history:count"
  },
  // Settings channels
  SETTINGS: {
    GET: "settings:get",
    SET: "settings:set"
  },
  // Platform channels
  PLATFORM: {
    GET: "platform:get"
  }
};
const electronAPI = {
  // Volume control
  volume: {
    get: () => electron.ipcRenderer.invoke(IPC_CHANNELS.VOLUME.GET),
    set: (level) => electron.ipcRenderer.invoke(IPC_CHANNELS.VOLUME.SET, level),
    dim: (targetLevel) => electron.ipcRenderer.invoke(IPC_CHANNELS.VOLUME.DIM, targetLevel),
    restore: () => electron.ipcRenderer.invoke(IPC_CHANNELS.VOLUME.RESTORE),
    getStatus: () => electron.ipcRenderer.invoke(IPC_CHANNELS.VOLUME.STATUS)
  },
  // Chat history
  history: {
    save: (entry) => electron.ipcRenderer.invoke(IPC_CHANNELS.HISTORY.SAVE, entry),
    query: (query) => electron.ipcRenderer.invoke(IPC_CHANNELS.HISTORY.QUERY, query),
    delete: (id) => electron.ipcRenderer.invoke(IPC_CHANNELS.HISTORY.DELETE, id),
    count: (query) => electron.ipcRenderer.invoke(IPC_CHANNELS.HISTORY.COUNT, query)
  },
  // Settings
  settings: {
    get: () => electron.ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET),
    set: (settings) => electron.ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SET, settings)
  },
  // Platform
  platform: {
    get: () => electron.ipcRenderer.invoke(IPC_CHANNELS.PLATFORM.GET)
  }
};
electron.contextBridge.exposeInMainWorld("electronAPI", electronAPI);
