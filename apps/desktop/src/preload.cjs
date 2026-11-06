// Puente seguro entre la web (ventana) y el proceso principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gmlDesktop', {
  getLicense: () => ipcRenderer.invoke('license:get'),
  activate: (key) => ipcRenderer.invoke('license:activate', key),
  deactivate: () => ipcRenderer.invoke('license:deactivate'),
  refresh: () => ipcRenderer.invoke('license:refresh'),
  openShop: () => ipcRenderer.invoke('shop:open'),
  onLicenseChanged: (cb) => ipcRenderer.on('license:changed', (_e, lic) => cb(lic)),
  onShowLicense: (cb) => ipcRenderer.on('license:show', () => cb()),
});
