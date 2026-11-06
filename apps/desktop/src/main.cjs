const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { machineId, evaluate } = require('./license.cjs');

const SERVER = (process.env.GML_SERVER || 'https://app.easysoftechnic.com').replace(/\/$/, '');
const MODULES = {
  gmlParcela: 'GML de parcela',
  gmlEdificio: 'GML de edificio',
  operaciones: 'Operaciones parcelarias',
  geometria: 'Geometría y coordenadas',
  exportacion: 'Conversión y exportación',
  informes: 'Informes y documentos',
  qgis: 'Conexión con QGIS',
};

const PUBLIC_KEY = fs.readFileSync(path.join(__dirname, '..', 'licencia-publica.pem'), 'utf8');
const MID = machineId();
const licenseFile = () => path.join(app.getPath('userData'), 'licencia.json');
const webIndex = () =>
  app.isPackaged ? path.join(process.resourcesPath, 'web', 'index.html') : path.join(__dirname, '..', '..', 'web', 'dist', 'index.html');

let win;

function readSaved() {
  try {
    return JSON.parse(fs.readFileSync(licenseFile(), 'utf8'));
  } catch {
    return undefined;
  }
}
function save(data) {
  fs.mkdirSync(path.dirname(licenseFile()), { recursive: true });
  if (data) fs.writeFileSync(licenseFile(), JSON.stringify(data, null, 2));
  else fs.rmSync(licenseFile(), { force: true });
}

function current() {
  const saved = readSaved();
  return { ...evaluate(saved, PUBLIC_KEY, MID), key: saved?.key, machineName: os.hostname(), server: SERVER };
}

async function post(pathname, body) {
  const res = await fetch(`${SERVER}${pathname}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status} del servidor`);
  return data;
}

function changed() {
  const lic = current();
  win?.webContents.send('license:changed', lic);
  buildMenu(lic);
  return lic;
}

/** Al arrancar con conexión se renueva el certificado para alargar el plazo sin conexión. */
async function refresh() {
  const saved = readSaved();
  if (!saved?.key) return current();
  try {
    const { token } = await post('/api/licenses/refresh', { key: saved.key, machineId: MID });
    save({ ...saved, token });
  } catch (e) {
    // Sin conexión: se sigue con el certificado guardado mientras no venza.
    if (/anulada|caduc|ya no está activado/i.test(String(e.message))) save({ key: saved.key });
  }
  return changed();
}

ipcMain.handle('license:get', () => current());
ipcMain.handle('license:refresh', () => refresh());
ipcMain.handle('license:activate', async (_e, key) => {
  const clean = String(key || '').trim().toUpperCase();
  const { token } = await post('/api/licenses/activate', { key: clean, machineId: MID, machineName: os.hostname() });
  save({ key: clean, token });
  return changed();
});
ipcMain.handle('license:deactivate', async () => {
  const saved = readSaved();
  if (saved?.key) await post('/api/licenses/deactivate', { key: saved.key, machineId: MID }).catch(() => undefined);
  save(undefined);
  return changed();
});
// Consultas a los servicios públicos del Catastro: solo a su servidor y por HTTPS.
ipcMain.handle('catastro:fetch', async (_e, url) => {
  const u = new URL(String(url));
  if (u.protocol !== 'https:' || u.hostname !== 'ovc.catastro.meh.es') throw new Error('Dirección no permitida');
  const res = await fetch(u, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'GML-EasySoftechnic' } });
  if (!res.ok) throw new Error(`El Catastro no responde (error ${res.status})`);
  return res.text();
});
ipcMain.handle('shop:open', () => shell.openExternal(`${SERVER}/#cuenta`));

function buildMenu(lic) {
  const has = new Set(lic.status === 'ok' ? lic.modules : []);
  const template = [
    { label: 'Archivo', submenu: [{ role: 'reload', label: 'Recargar' }, { type: 'separator' }, { role: 'quit', label: 'Salir' }] },
    {
      // Menú común: todos los módulos juntos, cada uno con su estado de licencia.
      label: 'Módulos',
      submenu: Object.entries(MODULES).map(([id, name]) => ({
        label: `${has.has(id) ? '✓' : '🔒'}  ${name}`,
        click: () => (has.has(id) ? undefined : win?.webContents.send('license:show')),
      })),
    },
    { label: 'Ver', submenu: [{ role: 'zoomIn', label: 'Ampliar' }, { role: 'zoomOut', label: 'Reducir' }, { role: 'resetZoom', label: 'Tamaño normal' }, { role: 'togglefullscreen', label: 'Pantalla completa' }, { type: 'separator' }, { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }] },
    {
      label: 'Ayuda',
      submenu: [
        { label: 'Activar licencia…', click: () => win?.webContents.send('license:show') },
        { label: 'Comprar o renovar licencia', click: () => shell.openExternal(`${SERVER}/#cuenta`) },
        { type: 'separator' },
        {
          label: 'Acerca de',
          click: () =>
            dialog.showMessageBox(win, {
              title: 'GML EasySoftechnic',
              message: `GML EasySoftechnic ${app.getVersion()}`,
              detail: `Licencia: ${lic.status === 'ok' ? `${lic.key}\nMódulos: ${lic.modules.map((m) => MODULES[m]).join(', ')}` : 'sin activar'}\nEquipo: ${os.hostname()}`,
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'GML EasySoftechnic',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });
  void win.loadFile(webIndex());
  buildMenu(current());
}

app.whenReady().then(() => {
  createWindow();
  void refresh();
});
app.on('window-all-closed', () => app.quit());
