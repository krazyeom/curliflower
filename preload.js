const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getCommands: () => ipcRenderer.invoke('get-commands'),
  saveCommands: (commands) => ipcRenderer.invoke('save-commands', commands),
  getAutoLaunch: () => ipcRenderer.invoke('get-autolaunch'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-autolaunch', enabled),
  parseCurl: (curlString) => ipcRenderer.invoke('parse-curl', curlString),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  executeRequest: (cmd) => ipcRenderer.invoke('execute-request', cmd),
  authCheck: (cafeId) => ipcRenderer.invoke('auth-check', cafeId),
  authRequest: (cafeId) => ipcRenderer.invoke('auth-request', cafeId),
  getStoredAuth: () => ipcRenderer.invoke('get-stored-auth'),
  logoutAuth: () => ipcRenderer.invoke('logout-auth'),
});
