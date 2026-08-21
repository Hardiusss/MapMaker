'use strict';
const { contextBridge, ipcRenderer } = require('electron');

/**
 * The single, tightly-scoped bridge between the renderer and the OS.
 * Everything the editor needs to live on disk goes through here.
 */
contextBridge.exposeInMainWorld('aetheria', {
  isDesktop: true,

  saveDialog: (opts) => ipcRenderer.invoke('dialog:save', opts),
  openDialog: (opts) => ipcRenderer.invoke('dialog:open', opts),

  writeBinary: (filePath, base64) => ipcRenderer.invoke('fs:writeBinary', filePath, base64),
  writeText: (filePath, text) => ipcRenderer.invoke('fs:writeText', filePath, text),
  readBinary: (filePath) => ipcRenderer.invoke('fs:readBinary', filePath),
  readText: (filePath) => ipcRenderer.invoke('fs:readText', filePath),
  exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),

  recentPush: (filePath) => ipcRenderer.invoke('app:recent:push', filePath),
  recentList: () => ipcRenderer.invoke('app:recent:list'),
  getPrefs: () => ipcRenderer.invoke('app:prefs:get'),
  setPrefs: (prefs) => ipcRenderer.invoke('app:prefs:set', prefs),
  info: () => ipcRenderer.invoke('app:info'),
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItem', filePath),
  setTitle: (title) => ipcRenderer.invoke('app:setTitle', title),

  onMenu: (handler) => {
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on('menu', listener);
    return () => ipcRenderer.removeListener('menu', listener);
  },
});
