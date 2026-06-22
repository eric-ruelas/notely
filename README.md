# Notely

Floating sticky notes for macOS. Lives in your menu bar, stays out of your way.

![Notely](https://github.com/eric-ruelas/notely/assets/placeholder/preview.png)

## Features

- Multiple notes, each in its own floating window
- Color-coded notes — pick from a set of soft tones
- Rich text — bold, strikethrough, bullet lists, font size, font family
- Clickable links open in your browser
- Notes persist between sessions and remember their position and size
- Frameless, transparent windows — no chrome, just the note

## Install & run

```bash
git clone https://github.com/eric-ruelas/notely.git
cd notely
npm install
npm start
```

Requires [Node.js](https://nodejs.org) and [Electron](https://electronjs.org) (installed via `npm install`).

## Build a macOS app

```bash
npm run build
```

Outputs a `.app` bundle to `dist/`.

## Stack

- [Electron](https://electronjs.org) — desktop shell
- Vanilla JS + `contenteditable` — no framework
- `contextBridge` + `ipcMain/ipcRenderer` — secure main ↔ renderer communication

## License

MIT
