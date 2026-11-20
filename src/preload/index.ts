import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type AxisTreeApi } from '@shared/ipc'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: AxisTreeApi = {
  selectWorkspace: () => ipcRenderer.invoke(IPC.selectWorkspace),
  openWorkspace: (root) => ipcRenderer.invoke(IPC.openWorkspace, root),
  recentWorkspaces: () => ipcRenderer.invoke(IPC.recentWorkspaces),
  rescan: () => ipcRenderer.invoke(IPC.rescan),
  readText: (rel) => ipcRenderer.invoke(IPC.readText, rel),
  writeText: (rel, content) => ipcRenderer.invoke(IPC.writeText, rel, content),
  createFile: (rel, content) => ipcRenderer.invoke(IPC.createFile, rel, content),
  openPath: (rel) => ipcRenderer.invoke(IPC.openPath, rel),
  showInFolder: (rel) => ipcRenderer.invoke(IPC.showInFolder, rel),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  saveMeta: (meta) => ipcRenderer.invoke(IPC.saveMeta, meta),
  confirm: (options) => ipcRenderer.invoke(IPC.confirm, options),
  onWorkspaceChanged: (cb) => subscribe(IPC.workspaceChanged, cb),
  onMetaChanged: (cb) => subscribe(IPC.metaChanged, cb),
  onFlushRequest: (cb) =>
    subscribe<void>(IPC.flushRequest, () => {
      Promise.resolve()
        .then(cb)
        .catch((err) => console.error('[flush]', err))
        .finally(() => ipcRenderer.send(IPC.flushDone))
    })
}

contextBridge.exposeInMainWorld('axistree', api)
