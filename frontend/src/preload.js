const { contextBridge, ipcRenderer } = require('electron');

// Expose volume control API to renderer
contextBridge.exposeInMainWorld('volumeControl', {
  get: () => ipcRenderer.invoke('volume:get'),
  set: (level) => ipcRenderer.invoke('volume:set', level),
  dim: (targetLevel) => ipcRenderer.invoke('volume:dim', targetLevel),
  restore: () => ipcRenderer.invoke('volume:restore')
});
