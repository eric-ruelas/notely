const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, shell } = require('electron')
const path = require('path')
const fs = require('fs')

const NOTES_FILE     = path.join(app.getPath('userData'), 'notely.json')
const NOTES_FILE_OLD = path.join(app.getPath('userData'), 'sticky-notes.json')
const noteWindows = new Map()
const geoTimers = new Map()
let tray = null
let notesCache = null
let diskWriteTimer = null

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
  win.on('blur',  () => { if (!win.isDestroyed()) win.webContents.send('window-blur') })
  win.on('focus', () => { if (!win.isDestroyed()) win.webContents.send('window-focus') })

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

  const buildMenu = () => Menu.buildFromTemplate([
    { label: 'New Note', click: spawnNewNote },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])

  if (tray) {
    tray.setContextMenu(buildMenu())
    tray.on('click', () => tray.setContextMenu(buildMenu()))
  }

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

app.on('before-quit', flushNotes)
app.on('window-all-closed', () => { /* keep tray alive */ })
