const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  savePdf: (bytes, suggestedName) => ipcRenderer.invoke('save-pdf', { bytes, suggestedName }),
  openPath: (p) => ipcRenderer.invoke('open-path', p),
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
  // Images opened from Explorer (context menu, "Apri con", "Invia a").
  onOpenFiles: (cb) => {
    ipcRenderer.on('open-files', (_e, files) => cb(files.map((f) => ({ name: f.name, data: f.data }))));
    ipcRenderer.send('renderer-ready');
  },
});
