const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, session } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const IMAGE_EXT = new Set([
  'jpg', 'jpeg', 'jfif', 'png', 'gif', 'bmp', 'webp', 'avif',
  'heic', 'heif', 'tif', 'tiff', 'svg', 'ico',
]);

let win;
let rendererReady = false;

// ---------- files passed by Explorer ("Apri con", menu contestuale, "Invia a") ----------

// Explorer starts one process per selected file for context-menu verbs; the
// extra processes forward their paths here (second-instance), so we collect
// them for a moment and import them together.
const pendingPaths = [];
let flushTimer = null;

function imagePathsFromArgv(argv) {
  return argv
    .slice(1)
    .filter((a) => !a.startsWith('-') && IMAGE_EXT.has(path.extname(a).slice(1).toLowerCase()));
}

function queuePaths(paths) {
  if (!paths.length) return;
  pendingPaths.push(...paths);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushPaths, 450);
}

async function flushPaths() {
  if (!rendererReady || !pendingPaths.length) return;
  const unique = [...new Set(pendingPaths.splice(0))]
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true, sensitivity: 'base' }));
  const files = [];
  for (const p of unique) {
    try {
      const data = await fs.readFile(p);
      files.push({ name: path.basename(p), data });
    } catch { /* file vanished or unreadable: skip */ }
  }
  if (files.length && win) win.webContents.send('open-files', files);
}

function focusWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// ---------- window ----------

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1040,
    minHeight: 660,
    title: 'Immagini in PDF',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14151a' : '#f4f5f8',
    icon: path.join(__dirname, 'renderer', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webviewTag: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // The app never opens other windows or navigates away from its own page.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('render-process-gone', () => { rendererReady = false; });
  win.on('closed', () => { win = null; });
}

// ---------- IPC ----------

// Only PDFs this app saved can be opened / revealed.
const savedPdfs = new Set();

ipcMain.on('renderer-ready', () => {
  rendererReady = true;
  flushPaths();
});

ipcMain.handle('save-pdf', async (_e, { bytes, suggestedName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Salva PDF',
    defaultPath: path.join(app.getPath('documents'), suggestedName || 'Documento.pdf'),
    filters: [{ name: 'Documento PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return null;
  await fs.writeFile(filePath, Buffer.from(bytes));
  savedPdfs.add(filePath);
  return filePath;
});

ipcMain.handle('open-path', (_e, p) => (savedPdfs.has(p) ? shell.openPath(p) : 'denied'));
ipcMain.handle('show-in-folder', (_e, p) => { if (savedPdfs.has(p)) shell.showItemInFolder(p); });

// ---------- lifecycle ----------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    focusWindow();
    queuePaths(imagePathsFromArgv(argv));
  });

  app.whenReady().then(() => {
    // No camera, microphone, notifications, etc.
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    createWindow();
    queuePaths(imagePathsFromArgv(process.argv));
  });
  app.on('window-all-closed', () => app.quit());
}
