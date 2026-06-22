const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  initNote: (cb) => ipcRenderer.on('init-note', (_e, data) => cb(data)),
  saveNote: (data) => ipcRenderer.send('save-note', data),
  deleteNote: (data) => ipcRenderer.send('delete-note', data),
  newNote: () => ipcRenderer.send('new-note'),
  onBlur:  (cb) => ipcRenderer.on('window-blur',  cb),
  onFocus: (cb) => ipcRenderer.on('window-focus', cb),
  openUrl: (url) => ipcRenderer.send('open-url', url),
})
