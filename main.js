const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

const NOTES_FILE     = path.join(app.getPath('userData'), 'notely.json')
const NOTES_FILE_OLD = path.join(app.getPath('userData'), 'sticky-notes.json')
const GITHUB_RELEASES = 'https://api.github.com/repos/eric-ruelas/notely/releases/latest'
const noteWindows = new Map()
const geoTimers = new Map()
let tray = null
let notesCache = null
let diskWriteTimer = null
let pendingUpdate = null  // { version, url } when a newer release is found

function loadNotes() {
  if (notesCache) return notesCache
  try {
    // Migrate from old filename if needed
    if (!fs.existsSync(NOTES_FILE) && fs.existsSync(NOTES_FILE_OLD)) {
      fs.renameSync(NOTES_FILE_OLD, NOTES_FILE)
    }
    if (fs.existsSync(NOTES_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(NOTES_FILE, 'utf8'))
      if (Array.isArray(parsed)) notesCache = parsed
    }
  } catch {}
  if (!notesCache) notesCache = []
  return notesCache
}

function saveNotes(notes) {
  notesCache = notes
  clearTimeout(diskWriteTimer)
  diskWriteTimer = setTimeout(() => {
    try { fs.writeFileSync(NOTES_FILE, JSON.stringify(notesCache, null, 2)) } catch {}
  }, 300)
}

function flushNotes() {
  clearTimeout(diskWriteTimer)
  if (notesCache) try { fs.writeFileSync(NOTES_FILE, JSON.stringify(notesCache, null, 2)) } catch {}
}

function persistGeometry(id) {
  clearTimeout(geoTimers.get(id))
  geoTimers.set(id, setTimeout(() => {
    geoTimers.delete(id)
    const win = noteWindows.get(id)
    if (!win || win.isDestroyed()) return
    const [x, y] = win.getPosition()
    const [width, height] = win.getSize()
    const notes = loadNotes()
    const idx = notes.findIndex(n => n.id === id)
    if (idx >= 0) {
      notes[idx] = { ...notes[idx], x, y, width, height }
      saveNotes(notes)
    }
  }, 300))
}

function nextNotePosition() {
  const notes = loadNotes()
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const step = 30
  const maxSteps = Math.floor(Math.min(sw - 480, sh - 500) / step)
  const safe = Math.max(maxSteps, 1)
  const idx = notes.length % safe
  return { x: 100 + idx * step, y: 100 + idx * step }
}

function buildMenu() {
  return Menu.buildFromTemplate([
    pendingUpdate
      ? { label: `Update Available — v${pendingUpdate.version}`, click: promptUpdate }
      : { label: 'Check for Updates', click: () => checkForUpdates(false) },
    { type: 'separator' },
    { label: 'New Note', click: spawnNewNote },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])
}

async function checkForUpdates(silent = true) {
  try {
    const res = await fetch(GITHUB_RELEASES, { headers: { 'User-Agent': 'Notely' } })
    if (!res.ok) return
    const data = await res.json()
    const latest = data.tag_name?.replace(/^v/, '')
    const current = app.getVersion()
    if (!latest || latest === current) {
      if (!silent) dialog.showMessageBox({ type: 'info', title: 'Notely', message: `You're up to date! (v${current})`, buttons: ['OK'] })
      return
    }
    pendingUpdate = { version: latest, url: data.html_url }
    if (tray) tray.setContextMenu(buildMenu())
    if (!silent) promptUpdate()
  } catch {}
}

function promptUpdate() {
  if (!pendingUpdate) return
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: `Notely v${pendingUpdate.version} is available`,
    detail: `You're running v${app.getVersion()}. Download the latest version?`,
    buttons: ['Download', 'Later'],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 0) shell.openExternal(pendingUpdate.url)
  })
}

function spawnNewNote() {
  const id = String(Date.now())
  const notes = loadNotes()
  const { x, y } = nextNotePosition()
  const note = { id, content: '', color: '#BFD7FF', x, y, width: 380, height: 400 }
  notes.push(note)
  saveNotes(notes)
  createNote(note)
}

function createNote(noteData) {
  const id = noteData.id || String(Date.now())
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize

  const cardW = noteData.width  ?? 380
  const cardH = noteData.height ?? 400

  const x = Math.round(Math.max(0, Math.min(noteData.x ?? 100, sw - cardW)))
  const y = Math.round(Math.max(0, Math.min(noteData.y ?? 100, sh - cardH)))

  const win = new BrowserWindow({
    x, y,
    width: cardW,
    height: cardH,
    minWidth: 380,
    minHeight: 200,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.loadFile('note.html')
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('init-note', { ...noteData, id })
    win.show()
  })

  win.on('moved',   () => persistGeometry(id))
  win.on('resized', () => persistGeometry(id))
  win.on('closed', () => {
    noteWindows.delete(id)
    clearTimeout(geoTimers.get(id))
    geoTimers.delete(id)
  })
  win.on('blur',       () => { if (!win.isDestroyed()) win.webContents.send('window-blur') })
  win.on('focus',      () => { if (!win.isDestroyed()) win.webContents.send('window-focus') })

  noteWindows.set(id, win)
  return id
}

app.whenReady().then(() => {
  app.dock.hide()

  try {
    tray = new Tray(nativeImage.createEmpty())
    tray.setTitle('🗒')
    tray.setToolTip('Notely')
  } catch (e) { console.error('Tray:', e) }

  if (tray) {
    tray.setContextMenu(buildMenu())
    tray.on('click', () => tray.setContextMenu(buildMenu()))
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Notely',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Note', accelerator: 'CmdOrCtrl+N', click: spawnNewNote },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'selectAll' },
      ],
    },
  ]))

  // Silently check for updates shortly after launch
  setTimeout(() => checkForUpdates(true), 5000)

  const notes = loadNotes()
  if (notes.length === 0) {
    spawnNewNote()
  } else {
    notes.forEach(n => createNote(n))
  }
})

ipcMain.on('save-note', (_e, { id, content, color, font, size }) => {
  const notes = loadNotes()
  const idx = notes.findIndex(n => n.id === id)
  if (idx >= 0) {
    const win = noteWindows.get(id)
    let geo = {}
    if (win && !win.isDestroyed()) {
      const [x, y] = win.getPosition()
      const [width, height] = win.getSize()
      geo = { x, y, width, height }
    }
    notes[idx] = { ...notes[idx], ...geo, content, color, font, size }
    saveNotes(notes)
  }
})

ipcMain.on('open-url', (_e, url) => {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') shell.openExternal(url)
  } catch {}
})

ipcMain.on('delete-note', (_e, { id }) => {
  let notes = loadNotes()
  notes = notes.filter(n => n.id !== id)
  saveNotes(notes)
  flushNotes()
  const win = noteWindows.get(id)
  if (win && !win.isDestroyed()) win.close()
})

ipcMain.on('new-note', spawnNewNote)

const collapsedNotes = new Map() // id -> { width, height }

ipcMain.on('minimize-note', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win || win.isDestroyed()) return
  const id = [...noteWindows.entries()].find(([, w]) => w === win)?.[0]
  if (collapsedNotes.has(id)) {
    const { width, height } = collapsedNotes.get(id)
    collapsedNotes.delete(id)
    win.setMinimumSize(380, 200)
    win.setSize(width, height)
    win.setResizable(true)
    setTimeout(() => {
      if (!win.isDestroyed()) win.webContents.send('window-collapsed', false)
    }, 50)
  } else {
    const [width, height] = win.getSize()
    collapsedNotes.set(id, { width, height })
    win.webContents.send('window-collapsed', true)
    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.setResizable(false)
        win.setMinimumSize(380, 36)
        win.setSize(width, 36)
      }
    }, 150)
  }
})

const zoomedNotes = new Set()

ipcMain.on('zoom-note', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win || win.isDestroyed()) return
  const id = [...noteWindows.entries()].find(([, w]) => w === win)?.[0]
  if (zoomedNotes.has(id)) {
    zoomedNotes.delete(id)
    win.unmaximize()
    win.webContents.send('window-maximized', false)
  } else {
    zoomedNotes.add(id)
    win.maximize()
    win.webContents.send('window-maximized', true)
  }
})

app.on('before-quit', flushNotes)
app.on('window-all-closed', () => { /* keep tray alive */ })
