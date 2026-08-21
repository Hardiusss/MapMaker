'use strict';
/**
 * Aetheria Cartographer — Electron main process.
 * Plain CommonJS on purpose: no build step for the main process keeps the
 * desktop shell dependency-free and trivially debuggable.
 */
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');

const DEV = process.env.AETHERIA_DEV === '1';
const DEV_URL = process.env.AETHERIA_DEV_URL || 'http://localhost:5173';

/** @type {BrowserWindow|null} */
let mainWindow = null;

// ---------------------------------------------------------------------------
// Persistent user settings (recent files, window bounds, ui prefs)
// ---------------------------------------------------------------------------
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch {
    return { recent: [], bounds: null, prefs: {} };
  }
}

function writeSettings(next) {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    console.error('[aetheria] failed to persist settings', err);
  }
}

function pushRecent(file) {
  const s = readSettings();
  s.recent = [file, ...(s.recent || []).filter((f) => f !== file)].slice(0, 12);
  writeSettings(s);
  buildMenu();
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  const s = readSettings();
  const bounds = s.bounds && typeof s.bounds.width === 'number' ? s.bounds : { width: 1600, height: 1000 };

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#12100e',
    title: 'Aetheria Cartographer',
    icon: path.join(__dirname, '..', 'resources', 'icon.png'),
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show());

  const persistBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const next = readSettings();
    next.bounds = mainWindow.getNormalBounds();
    writeSettings(next);
  };
  mainWindow.on('resize', persistBounds);
  mainWindow.on('move', persistBounds);
  mainWindow.on('closed', () => { mainWindow = null; });

  // Never let the renderer navigate away — this app is fully offline.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(DEV_URL) && !url.startsWith('file://')) e.preventDefault();
  });

  if (DEV) {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// ---------------------------------------------------------------------------
// Application menu
// ---------------------------------------------------------------------------
function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function buildMenu() {
  const recent = (readSettings().recent || []).map((file) => ({
    label: path.basename(file),
    click: () => send('menu', { command: 'open-path', path: file }),
  }));

  const isMac = process.platform === 'darwin';
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Map…', accelerator: 'CmdOrCtrl+N', click: () => send('menu', { command: 'new' }) },
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => send('menu', { command: 'open' }) },
        { label: 'Open Recent', submenu: recent.length ? recent : [{ label: '(empty)', enabled: false }] },
        { label: 'Import Map Image…', accelerator: 'CmdOrCtrl+I', click: () => send('menu', { command: 'import-image' }) },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('menu', { command: 'save' }) },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('menu', { command: 'save-as' }) },
        { type: 'separator' },
        {
          label: 'Export',
          submenu: [
            { label: 'PNG Image…', accelerator: 'CmdOrCtrl+E', click: () => send('menu', { command: 'export', format: 'png' }) },
            { label: 'Foundry VTT Scene…', click: () => send('menu', { command: 'export', format: 'foundry' }) },
            { label: 'Universal VTT (.dd2vtt)…', click: () => send('menu', { command: 'export', format: 'uvtt' }) },
            { label: 'Roll20 Bundle…', click: () => send('menu', { command: 'export', format: 'roll20' }) },
            { label: 'Print-ready PDF…', click: () => send('menu', { command: 'export', format: 'pdf' }) },
          ],
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send('menu', { command: 'undo' }) },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => send('menu', { command: 'redo' }) },
        { type: 'separator' },
        { label: 'Duplicate Selection', accelerator: 'CmdOrCtrl+D', click: () => send('menu', { command: 'duplicate' }) },
        { label: 'Delete Selection', accelerator: 'Delete', click: () => send('menu', { command: 'delete' }) },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => send('menu', { command: 'select-all' }) },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => send('menu', { command: 'zoom-in' }) },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => send('menu', { command: 'zoom-out' }) },
        { label: 'Fit to Window', accelerator: 'CmdOrCtrl+0', click: () => send('menu', { command: 'zoom-fit' }) },
        { type: 'separator' },
        { label: 'Toggle Grid', accelerator: 'CmdOrCtrl+G', click: () => send('menu', { command: 'toggle-grid' }) },
        { label: 'Toggle Walls Overlay', accelerator: 'CmdOrCtrl+W', click: () => send('menu', { command: 'toggle-walls' }) },
        { label: 'Toggle Lighting Preview', accelerator: 'CmdOrCtrl+L', click: () => send('menu', { command: 'toggle-lights' }) },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Generate',
      submenu: [
        { label: 'Region / World…', click: () => send('menu', { command: 'generate', kind: 'region' }) },
        { label: 'Dungeon…', click: () => send('menu', { command: 'generate', kind: 'dungeon' }) },
        { label: 'Cave System…', click: () => send('menu', { command: 'generate', kind: 'cave' }) },
        { label: 'City / Settlement…', click: () => send('menu', { command: 'generate', kind: 'city' }) },
        { label: 'Battle Map…', click: () => send('menu', { command: 'generate', kind: 'battle' }) },
        { type: 'separator' },
        { label: 'Auto-derive walls from map', click: () => send('menu', { command: 'derive-walls' }) },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', click: () => send('menu', { command: 'help-shortcuts' }) },
        { label: 'Foundry VTT Import Guide', click: () => send('menu', { command: 'help-foundry' }) },
        { label: 'About Aetheria', click: () => send('menu', { command: 'help-about' }) },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// IPC — file system bridge
// ---------------------------------------------------------------------------
ipcMain.handle('dialog:save', async (_e, opts) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: opts?.title || 'Save',
    defaultPath: opts?.defaultPath || path.join(app.getPath('documents'), opts?.defaultName || 'map'),
    filters: opts?.filters || [{ name: 'All Files', extensions: ['*'] }],
  });
  return res.canceled ? null : res.filePath;
});

ipcMain.handle('dialog:open', async (_e, opts) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: opts?.title || 'Open',
    properties: opts?.multi ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: opts?.filters || [{ name: 'All Files', extensions: ['*'] }],
  });
  return res.canceled ? [] : res.filePaths;
});

ipcMain.handle('fs:writeBinary', async (_e, filePath, base64) => {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, Buffer.from(base64, 'base64'));
  return true;
});

ipcMain.handle('fs:writeText', async (_e, filePath, text) => {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, text, 'utf8');
  return true;
});

ipcMain.handle('fs:readBinary', async (_e, filePath) => {
  const buf = await fsp.readFile(filePath);
  return buf.toString('base64');
});

ipcMain.handle('fs:readText', async (_e, filePath) => fsp.readFile(filePath, 'utf8'));

ipcMain.handle('fs:exists', async (_e, filePath) => fs.existsSync(filePath));

ipcMain.handle('app:recent:push', async (_e, filePath) => { pushRecent(filePath); return true; });
ipcMain.handle('app:recent:list', async () => readSettings().recent || []);
ipcMain.handle('app:prefs:get', async () => readSettings().prefs || {});
ipcMain.handle('app:prefs:set', async (_e, prefs) => {
  const s = readSettings();
  s.prefs = { ...(s.prefs || {}), ...prefs };
  writeSettings(s);
  return true;
});
ipcMain.handle('app:info', async () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  userData: app.getPath('userData'),
  documents: app.getPath('documents'),
  pictures: app.getPath('pictures'),
  home: os.homedir(),
}));
ipcMain.handle('shell:showItem', async (_e, filePath) => { shell.showItemInFolder(filePath); return true; });
ipcMain.handle('app:setTitle', async (_e, title) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle(title);
  return true;
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });

  app.whenReady().then(() => {
    nativeTheme.themeSource = 'dark';
    buildMenu();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
