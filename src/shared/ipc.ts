import type { AxisTreeMeta, FileEntry, ScanResult, WorkspaceSnapshot } from './types'

export const IPC = {
  selectWorkspace: 'workspace:select',
  openWorkspace: 'workspace:open',
  recentWorkspaces: 'workspace:recent',
  rescan: 'workspace:rescan',
  readText: 'file:read-text',
  writeText: 'file:write-text',
  createFile: 'file:create',
  openPath: 'shell:open-path',
  showInFolder: 'shell:show-in-folder',
  openExternal: 'shell:open-external',
  saveMeta: 'meta:save',
  confirm: 'dialog:confirm',
  flushDone: 'app:flush-done',
  // main -> renderer events
  workspaceChanged: 'event:workspace-changed',
  metaChanged: 'event:meta-changed',
  flushRequest: 'event:flush-request'
} as const

/** Custom protocol that serves workspace files to <img>/<iframe> (restricted to the open workspace). */
export const FILE_PROTOCOL = 'atfile'

export interface WorkspaceChange {
  /** Present when files/directories were added or removed: the full new listing. */
  scan?: ScanResult
  /** Fresh stats for files whose content changed. */
  updated: FileEntry[]
  /** Relative paths of files whose content changed. */
  changed: string[]
}

export interface RecentWorkspaces {
  last: string | null
  recent: string[]
}

export interface ConfirmOptions {
  message: string
  detail?: string
  okLabel?: string
  danger?: boolean
}

/** API exposed to the renderer as `window.axistree` by the preload script. */
export interface AxisTreeApi {
  selectWorkspace(): Promise<WorkspaceSnapshot | null>
  openWorkspace(root: string): Promise<WorkspaceSnapshot>
  recentWorkspaces(): Promise<RecentWorkspaces>
  rescan(): Promise<ScanResult>
  readText(rel: string): Promise<string>
  writeText(rel: string, content: string): Promise<FileEntry>
  createFile(rel: string, content: string): Promise<FileEntry>
  openPath(rel: string): Promise<void>
  showInFolder(rel: string): Promise<void>
  openExternal(url: string): Promise<void>
  saveMeta(meta: AxisTreeMeta): Promise<void>
  confirm(options: ConfirmOptions): Promise<boolean>
  onWorkspaceChanged(cb: (change: WorkspaceChange) => void): () => void
  onMetaChanged(cb: (meta: AxisTreeMeta) => void): () => void
  /** Called before the window closes; the app waits (briefly) for the returned promise. */
  onFlushRequest(cb: () => Promise<void>): () => void
}
