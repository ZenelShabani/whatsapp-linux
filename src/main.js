const {
  app, BrowserWindow, Menu, Tray, nativeImage, shell, session, ipcMain, clipboard, Notification,
} = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_ID = 'whatsapp-linux';
const WA_URL = 'https://web.whatsapp.com/';
const WA_HOST = 'web.whatsapp.com';
const ASSETS = path.join(__dirname, '..', 'assets');

// A plain Chrome user agent. WhatsApp Web rejects UAs that mention Electron.
const CHROME_MAJOR = process.versions.chrome.split('.')[0];
const USER_AGENT = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`;

app.setName(APP_ID);
app.setDesktopName(`${APP_ID}.desktop`);
app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations');

// ---------- settings ----------

const settingsFile = path.join(app.getPath('userData'), 'settings.json');
const defaults = { closeToTray: true, startHidden: false, bounds: { width: 1100, height: 780 }, maximized: false };

function loadSettings() {
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) };
  } catch {
    return { ...defaults };
  }
}

let settings = loadSettings();

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('could not save settings:', err.message);
  }
}

// ---------- autostart ----------

const autostartFile = path.join(os.homedir(), '.config', 'autostart', `${APP_ID}.desktop`);

function isAutostartEnabled() {
  return fs.existsSync(autostartFile);
}

function setAutostart(enabled) {
  if (!enabled) {
    fs.rmSync(autostartFile, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(autostartFile), { recursive: true });
  const exec = process.env.WA_LAUNCHER || process.execPath;
  fs.writeFileSync(autostartFile, [
    '[Desktop Entry]',
    'Type=Application',
    'Name=WhatsApp',
    `Exec=${exec} --hidden`,
    `Icon=${APP_ID}`,
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n'));
}

// ---------- single instance ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win = null;
let tray = null;
let quitting = false;
let unread = 0;

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

app.on('second-instance', showWindow);

// ---------- window ----------

function isWhatsAppUrl(url) {
  try {
    return new URL(url).host === WA_HOST;
  } catch {
    return false;
  }
}

function openExternal(url) {
  if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url);
}

function createWindow() {
  const startHidden = process.argv.includes('--hidden') || settings.startHidden;

  win = new BrowserWindow({
    ...settings.bounds,
    minWidth: 400,
    minHeight: 500,
    title: 'WhatsApp',
    icon: path.join(ASSETS, 'icon-256.png'),
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111b21',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: 'persist:whatsapp',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      // Keep running at full speed when hidden so messages and notifications arrive on time.
      backgroundThrottling: false,
    },
  });

  if (settings.maximized) win.maximize();
  win.once('ready-to-show', () => {
    if (!startHidden) win.show();
  });

  win.webContents.setUserAgent(USER_AGENT);
  win.loadURL(WA_URL, { userAgent: USER_AGENT });

  // Links open in the system browser; the window itself stays on WhatsApp.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isWhatsAppUrl(url)) {
      event.preventDefault();
      openExternal(url);
    }
  });

  // The page sets the title to "(3) WhatsApp" when there are unread chats.
  win.on('page-title-updated', (event, title) => {
    event.preventDefault();
    const match = title.match(/^\((\d+)\)/);
    setUnread(match ? parseInt(match[1], 10) : 0);
  });

  win.on('close', (event) => {
    rememberBounds();
    if (!quitting && settings.closeToTray && tray) {
      event.preventDefault();
      win.hide();
    }
  });

  win.webContents.on('context-menu', (_event, params) => buildContextMenu(params).popup({ window: win }));

  // Recover automatically if the renderer crashes.
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('renderer gone:', details.reason);
    if (details.reason !== 'clean-exit') setTimeout(() => win && win.reload(), 1000);
  });
}

function rememberBounds() {
  if (!win) return;
  settings.maximized = win.isMaximized();
  if (!settings.maximized && !win.isMinimized() && !win.isFullScreen()) settings.bounds = win.getBounds();
  saveSettings();
}

// ---------- unread badge ----------

function setUnread(count) {
  if (count === unread) return;
  unread = count;
  app.setBadgeCount(count);
  if (win) win.setTitle(count ? `WhatsApp (${count})` : 'WhatsApp');
  if (tray) {
    tray.setImage(path.join(ASSETS, count ? 'tray-unread.png' : 'tray.png'));
    tray.setToolTip(count ? `WhatsApp: ${count} unread` : 'WhatsApp');
  }
}

// ---------- tray ----------

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Show WhatsApp', click: showWindow },
    { type: 'separator' },
    {
      label: 'Close to tray',
      type: 'checkbox',
      checked: settings.closeToTray,
      click: (item) => { settings.closeToTray = item.checked; saveSettings(); },
    },
    {
      label: 'Start on login',
      type: 'checkbox',
      checked: isAutostartEnabled(),
      click: (item) => setAutostart(item.checked),
    },
    { type: 'separator' },
    { label: 'Reload', click: () => win && win.reload() },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]);
}

function createTray() {
  try {
    tray = new Tray(path.join(ASSETS, 'tray.png'));
  } catch (err) {
    console.error('tray unavailable:', err.message);
    tray = null;
    return;
  }
  tray.setToolTip('WhatsApp');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => (win && win.isVisible() && win.isFocused() ? win.hide() : showWindow()));
}

// ---------- menus ----------

function buildAppMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'WhatsApp',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => win && win.reload() },
        { label: 'Hide window', accelerator: 'CmdOrCtrl+W', click: () => win && win.hide() },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => { quitting = true; app.quit(); } },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+Plus', visible: false },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Shift+I' },
      ],
    },
  ]);
}

function buildContextMenu(params) {
  const items = [];
  const wc = win.webContents;

  if (params.misspelledWord) {
    for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
      items.push({ label: suggestion, click: () => wc.replaceMisspelling(suggestion) });
    }
    if (params.dictionarySuggestions.length === 0) items.push({ label: 'No suggestions', enabled: false });
    items.push({
      label: 'Add to dictionary',
      click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord),
    });
    items.push({ type: 'separator' });
  }

  if (params.linkURL) {
    items.push({ label: 'Open link in browser', click: () => openExternal(params.linkURL) });
    items.push({ label: 'Copy link', click: () => clipboard.writeText(params.linkURL) });
    items.push({ type: 'separator' });
  }

  if (params.mediaType === 'image' && params.srcURL) {
    items.push({ label: 'Copy image', click: () => wc.copyImageAt(params.x, params.y) });
    items.push({ label: 'Save image as…', click: () => wc.downloadURL(params.srcURL) });
    items.push({ type: 'separator' });
  }

  if (params.isEditable) {
    items.push(
      { role: 'undo', enabled: params.editFlags.canUndo },
      { role: 'redo', enabled: params.editFlags.canRedo },
      { type: 'separator' },
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { role: 'selectAll' },
    );
  } else if (params.selectionText) {
    items.push({ role: 'copy' });
  }

  while (items.length && items[items.length - 1].type === 'separator') items.pop();
  if (items.length === 0) items.push({ label: 'Reload', click: () => wc.reload() });
  return Menu.buildFromTemplate(items);
}

// ---------- session ----------

function configureSession() {
  const ses = session.fromPartition('persist:whatsapp');
  ses.setUserAgent(USER_AGENT);

  const allowed = new Set(['notifications', 'media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']);
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(allowed.has(permission) && isWhatsAppUrl(details.requestingUrl || wc.getURL()));
  });
  ses.setPermissionCheckHandler((_wc, permission, origin) => allowed.has(permission) && isWhatsAppUrl(origin));

  // Spellcheck in the system languages plus English, where dictionaries exist.
  const available = ses.availableSpellCheckerLanguages;
  const wanted = [...app.getPreferredSystemLanguages(), 'en-US'];
  const langs = [];
  for (const lang of wanted) {
    const match = available.find((a) => a === lang) || available.find((a) => a.split('-')[0] === lang.split('-')[0]);
    if (match && !langs.includes(match)) langs.push(match);
  }
  if (langs.length) ses.setSpellCheckerLanguages(langs.slice(0, 3));
}

// ---------- ipc ----------

ipcMain.on('notification-clicked', showWindow);

// ---------- lifecycle ----------

app.whenReady().then(() => {
  if (!Notification.isSupported()) console.warn('desktop notifications are not supported here');
  configureSession();
  Menu.setApplicationMenu(buildAppMenu());
  createTray();
  createWindow();
});

app.on('before-quit', () => {
  quitting = true;
  rememberBounds();
});

app.on('window-all-closed', () => app.quit());
