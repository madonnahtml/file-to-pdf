const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  savePdf: (bytes, suggestedName) => ipcRenderer.invoke('save-pdf', { bytes, suggestedName }),
  openPath: (p) => ipcRenderer.invoke('open-path', p),
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
});
