const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  initNote: (cb) => ipcRenderer.once('init-note', (_e, data) => cb(data)),
  saveNote: (data) => ipcRenderer.send('save-note', data),
  deleteNote: (data) => ipcRenderer.send('delete-note', data),
  newNote: () => ipcRenderer.send('new-note'),
  zoomNote: () => ipcRenderer.send('zoom-note'),
  minimizeNote: () => ipcRenderer.send('minimize-note'),
  onCollapsed: (cb) => ipcRenderer.on('window-collapsed', (_e, val) => cb(val)),
  onBlur:      (cb) => ipcRenderer.on('window-blur',      cb),
  onFocus:     (cb) => ipcRenderer.on('window-focus',     cb),
  onMaximized: (cb) => ipcRenderer.on('window-maximized', (_e, val) => cb(val)),
  openUrl: (url) => ipcRenderer.send('open-url', url),
})
