import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { pathToFileURL } from 'node:url'
import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  nativeTheme,
  net,
  protocol,
  shell,
  type IpcMainInvokeEvent
} from 'electron'
import { FILE_PROTOCOL, IPC, type ConfirmOptions } from '@shared/ipc'
import type { WorkspaceSnapshot } from '@shared/types'
import { Workspace } from './workspace'
import { getRecentWorkspaces, rememberWorkspace } from './appConfig'

// WSLg's GPU path drops some SVG strokes (e.g. icon arcs); software rendering is reliable there.
// Set AXISTREE_GPU=1 to keep hardware acceleration anyway.
const isWsl = process.platform === 'linux' && /microsoft/i.test(os.release())
if (isWsl && process.env.AXISTREE_GPU !== '1') app.disableHardwareAcceleration()

protocol.registerSchemesAsPrivileged([
  {
    scheme: FILE_PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

let mainWindow: BrowserWindow | null = null
let workspace: Workspace | null = null
let allowClose = false
let quitting = false

const devServerUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined

function requireWorkspace(): Workspace {
  if (!workspace) throw new Error('ワークスペースが開かれていません')
  return workspace
}

/** Only accept IPC from our own window's top frame. */
function assertTrusted(e: IpcMainInvokeEvent): void {
  if (!mainWindow || e.sender !== mainWindow.webContents || e.senderFrame !== mainWindow.webContents.mainFrame) {
    throw new Error('untrusted sender')
  }
}

function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R> | R): void {
  ipcMain.handle(channel, async (e, ...args) => {
    assertTrusted(e)
    return fn(...(args as A))
  })
}

async function openWorkspace(rootInput: unknown): Promise<WorkspaceSnapshot> {
  if (typeof rootInput !== 'string') throw new Error('不正なパスです')
  const st = await fs.stat(rootInput).catch(() => null)
  if (!st?.isDirectory()) throw new Error(`フォルダが見つかりません: ${rootInput}`)
  const root = await fs.realpath(rootInput)

  await workspace?.close()
  workspace = null

  const ws = new Workspace(root)
  const { meta, warning } = await ws.loadMeta()
  const scan = await ws.scan()
  ws.startWatching({
    onChange: (change) => mainWindow?.webContents.send(IPC.workspaceChanged, change),
    onMetaChange: (m) => mainWindow?.webContents.send(IPC.metaChanged, m)
  })
  workspace = ws
  await rememberWorkspace(root).catch((err) => console.error('[config]', err))
  const name = path.basename(root) || root
  mainWindow?.setTitle(`${name} — AxisTree`)
  return { root, name, scan, meta, warning }
}

function registerIpc(): void {
  handle(IPC.selectWorkspace, async () => {
    const res = await dialog.showOpenDialog(mainWindow!, {
      title: 'ワークスペースとして開くフォルダを選択',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return openWorkspace(res.filePaths[0])
  })
  handle(IPC.openWorkspace, (root: unknown) => openWorkspace(root))
  handle(IPC.recentWorkspaces, () => getRecentWorkspaces())
  handle(IPC.rescan, () => requireWorkspace().scan())
  handle(IPC.readText, (rel: unknown) => requireWorkspace().readText(rel))
  handle(IPC.writeText, (rel: unknown, content: unknown) => requireWorkspace().writeText(rel, content))
  handle(IPC.createFile, (rel: unknown, content: unknown) => requireWorkspace().createFile(rel, content))
  handle(IPC.saveMeta, (meta: unknown) => requireWorkspace().saveMeta(meta))

  handle(IPC.openPath, async (rel: unknown) => {
    const abs = await requireWorkspace().resolve(rel, { mustExist: true })
    const err = await shell.openPath(abs)
    if (err) throw new Error(err)
  })
  handle(IPC.showInFolder, async (rel: unknown) => {
    shell.showItemInFolder(await requireWorkspace().resolve(rel, { mustExist: true }))
  })
  handle(IPC.openExternal, async (url: unknown) => {
    if (typeof url !== 'string' || !/^(https?:|mailto:)/i.test(url)) throw new Error('開けないURLです')
    await shell.openExternal(url)
  })
  handle(IPC.confirm, async (opts: ConfirmOptions) => {
    const res = await dialog.showMessageBox(mainWindow!, {
      type: opts.danger ? 'warning' : 'question',
      message: String(opts.message ?? ''),
      detail: opts.detail ? String(opts.detail) : undefined,
      buttons: ['キャンセル', String(opts.okLabel ?? 'OK')],
      defaultId: 1,
      cancelId: 0,
      noLink: true
    })
    return res.response === 1
  })

  ipcMain.on(IPC.flushDone, (e) => {
    if (!mainWindow || e.sender !== mainWindow.webContents) return
    finishClose(mainWindow)
  })
}

function registerFileProtocol(): void {
  protocol.handle(FILE_PROTOCOL, async (req) => {
    if (!workspace) return new Response('No workspace', { status: 404 })
    try {
      const url = new URL(req.url)
      const rel = url.pathname
        .split('/')
        .filter(Boolean)
        .map((s) => decodeURIComponent(s))
        .join('/')
      const abs = await workspace.resolve(rel, { mustExist: true })
      return net.fetch(pathToFileURL(abs).toString())
    } catch {
      return new Response('Forbidden', { status: 403 })
    }
  })
}

/** Close for real after the renderer flushed (or timed out); resume an interrupted app quit. */
function finishClose(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  allowClose = true
  win.close()
  if (quitting) app.quit()
}

function isAppUrl(url: string): boolean {
  if (devServerUrl) return url.startsWith(devServerUrl)
  return url.startsWith('file://')
}

function createWindow(): void {
  allowClose = false
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 560,
    show: false,
    title: 'AxisTree',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16181b' : '#f7f7f5',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Enables Chromium's built-in PDF viewer for <iframe> previews.
      plugins: true
    }
  })
  const win = mainWindow

  win.once('ready-to-show', () => win.show())

  // Never let the app window navigate away or spawn windows; send web links to the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (isAppUrl(url)) return
    e.preventDefault()
    if (/^https?:/i.test(url)) void shell.openExternal(url)
  })

  // Give the renderer a chance to flush unsaved edits before closing.
  win.on('close', (e) => {
    if (allowClose || win.webContents.isDestroyed()) return
    e.preventDefault()
    win.webContents.send(IPC.flushRequest)
    setTimeout(() => finishClose(win), 3000)
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  if (devServerUrl) void win.loadURL(devServerUrl)
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  registerFileProtocol()
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  void workspace?.close()
  if (process.platform !== 'darwin') app.quit()
})
