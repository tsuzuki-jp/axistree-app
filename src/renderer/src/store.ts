import { create } from 'zustand'
import { createDefaultMeta, getPaths, setPaths } from '@shared/meta'
import { FS_AXIS, UNCATEGORIZED_KEY, ancestorKeys, autoDatePath } from '@shared/tree'
import { dirnameRel } from '@shared/relPath'
import type { WorkspaceChange } from '@shared/ipc'
import type { AxisPath, AxisTreeMeta, FileEntry, ScanResult, WorkspaceSnapshot } from '@shared/types'
import { api, errorMessage } from './lib/api'
import { registerFlusher } from './lib/flush'
import { loadPref, savePref } from './lib/storage'

export interface SelectedFolder {
  axis: string
  key: string
  path: AxisPath
  uncategorized: boolean
}

export interface Toast {
  id: number
  message: string
  kind: 'info' | 'error'
}

export type DialogKind = 'newFile' | 'settings' | null

interface AppState {
  workspace: { root: string; name: string } | null
  files: FileEntry[]
  fileMap: Map<string, FileEntry>
  dirs: string[]
  meta: AxisTreeMeta
  activeAxis: string
  /** Expanded folder keys, as `${axis}\u0001${folderKey}`. */
  expanded: Set<string>
  selectedFile: string | null
  selectedFolder: SelectedFolder | null
  filter: string
  /** Incremented when the tree should scroll the selected file into view. */
  revealTick: number
  toasts: Toast[]
  dialog: DialogKind

  loadSnapshot(s: WorkspaceSnapshot): void
  applyChange(c: WorkspaceChange): void
  addFile(f: FileEntry): void
  receiveMetaFromDisk(meta: AxisTreeMeta): void
  updateMeta(fn: (m: AxisTreeMeta) => AxisTreeMeta): void
  setActiveAxis(axis: string): void
  toggleFolder(axis: string, key: string): void
  setExpanded(axis: string, keys: string[], value: boolean): void
  collapseAll(axis: string): void
  selectFile(rel: string | null, opts?: { reveal?: boolean }): void
  selectFolder(folder: SelectedFolder | null): void
  revealFolder(axis: string, path: AxisPath): void
  setFilter(q: string): void
  toast(message: string, kind?: Toast['kind']): void
  dismissToast(id: number): void
  openDialog(d: DialogKind): void
}

export const expandKey = (axis: string, key: string): string => `${axis}\u0001${key}`

// ------------------------------------------------------------------ metadata persistence

let pendingMeta: AxisTreeMeta | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

async function flushMeta(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  const meta = pendingMeta
  if (!meta) return
  pendingMeta = null
  try {
    await api.saveMeta(meta)
  } catch (err) {
    useApp.getState().toast(`分類情報の保存に失敗しました: ${errorMessage(err)}`, 'error')
  }
}

function scheduleMetaSave(meta: AxisTreeMeta): void {
  pendingMeta = meta
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void flushMeta(), 300)
}

registerFlusher(flushMeta)

/** Give every file that lacks a date path one derived from its timestamps. */
export function withAutoDates(meta: AxisTreeMeta, files: FileEntry[]): AxisTreeMeta {
  const { dateAxis, dateSource } = meta.settings
  let next = meta
  for (const f of files) {
    if (getPaths(next, f.relPath, dateAxis).length === 0) {
      next = setPaths(next, f.relPath, dateAxis, [autoDatePath(f, dateSource)])
    }
  }
  return next
}

function indexFiles(files: FileEntry[]): Map<string, FileEntry> {
  return new Map(files.map((f) => [f.relPath, f]))
}

/** Folder keys to expand so that `rel` becomes visible in `axis`. */
function revealKeys(state: Pick<AppState, 'meta'>, axis: string, rel: string): string[] {
  if (axis === FS_AXIS) {
    const dir = dirnameRel(rel)
    return dir ? ancestorKeys(dir.split('/')) : []
  }
  const paths = getPaths(state.meta, rel, axis)
  if (paths.length === 0) return [UNCATEGORIZED_KEY]
  return paths.flatMap(ancestorKeys)
}

const uiPrefKey = (root: string): string => `ui:${root}`

// ------------------------------------------------------------------ store

export const useApp = create<AppState>((set, get) => ({
  workspace: null,
  files: [],
  fileMap: new Map(),
  dirs: [],
  meta: createDefaultMeta(),
  activeAxis: 'Date',
  expanded: new Set(),
  selectedFile: null,
  selectedFolder: null,
  filter: '',
  revealTick: 0,
  toasts: [],
  dialog: null,

  loadSnapshot: (s) => {
    pendingMeta = null
    const pref = loadPref<{ axis?: string }>(uiPrefKey(s.root), {})
    const axis =
      pref.axis && (pref.axis === FS_AXIS || s.meta.axes.includes(pref.axis))
        ? pref.axis
        : (s.meta.axes[0] ?? FS_AXIS)
    set({
      workspace: { root: s.root, name: s.name },
      files: s.scan.files,
      fileMap: indexFiles(s.scan.files),
      dirs: s.scan.dirs,
      meta: s.meta,
      activeAxis: axis,
      expanded: new Set(),
      selectedFile: null,
      selectedFolder: null,
      filter: ''
    })
    if (s.meta.settings.autoDateOnScan) applyAutoDatesOnScan(s.scan)
    if (s.warning) get().toast(s.warning, 'error')
  },

  applyChange: (c) => {
    if (c.scan) {
      const fileMap = indexFiles(c.scan.files)
      const { selectedFile } = get()
      set({
        files: c.scan.files,
        fileMap,
        dirs: c.scan.dirs,
        selectedFile: selectedFile && fileMap.has(selectedFile) ? selectedFile : null
      })
      if (get().meta.settings.autoDateOnScan) applyAutoDatesOnScan(c.scan)
    }
    if (c.updated.length > 0) {
      const fileMap = new Map(get().fileMap)
      for (const f of c.updated) if (fileMap.has(f.relPath)) fileMap.set(f.relPath, f)
      set({ fileMap, files: [...fileMap.values()] })
    }
  },

  addFile: (f) => {
    const fileMap = new Map(get().fileMap)
    fileMap.set(f.relPath, f)
    set({ fileMap, files: [...fileMap.values()] })
  },

  receiveMetaFromDisk: (meta) => {
    // A local edit that has not been written yet wins; it will overwrite the file shortly.
    if (pendingMeta) return
    set({ meta })
    get().toast('.axistree.json の外部変更を読み込みました')
  },

  updateMeta: (fn) => {
    const meta = fn(get().meta)
    if (meta === get().meta) return
    set({ meta })
    scheduleMetaSave(meta)
  },

  setActiveAxis: (axis) => {
    const { workspace, selectedFile } = get()
    if (workspace) savePref(uiPrefKey(workspace.root), { axis })
    set({ activeAxis: axis, selectedFolder: null })
    if (selectedFile) get().selectFile(selectedFile, { reveal: true })
  },

  toggleFolder: (axis, key) => {
    const expanded = new Set(get().expanded)
    const k = expandKey(axis, key)
    if (expanded.has(k)) expanded.delete(k)
    else expanded.add(k)
    set({ expanded })
  },

  setExpanded: (axis, keys, value) => {
    const expanded = new Set(get().expanded)
    for (const key of keys) {
      if (value) expanded.add(expandKey(axis, key))
      else expanded.delete(expandKey(axis, key))
    }
    set({ expanded })
  },

  collapseAll: (axis) => {
    const prefix = expandKey(axis, '')
    set({ expanded: new Set([...get().expanded].filter((k) => !k.startsWith(prefix))) })
  },

  selectFile: (rel, opts) => {
    if (!opts?.reveal || !rel) {
      set({ selectedFile: rel })
      return
    }
    const { activeAxis } = get()
    get().setExpanded(activeAxis, revealKeys(get(), activeAxis, rel), true)
    set({ selectedFile: rel, revealTick: get().revealTick + 1 })
  },

  selectFolder: (folder) => set({ selectedFolder: folder }),

  revealFolder: (axis, path) => {
    const { workspace } = get()
    if (workspace) savePref(uiPrefKey(workspace.root), { axis })
    set({ activeAxis: axis })
    get().setExpanded(axis, ancestorKeys(path), true)
    set({
      selectedFolder: { axis, key: path.join('/'), path, uncategorized: false },
      revealTick: get().revealTick + 1
    })
  },

  setFilter: (filter) => set({ filter }),

  toast: (message, kind = 'info') => {
    const id = Date.now() + Math.random()
    set({ toasts: [...get().toasts, { id, message, kind }] })
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 3500)
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  openDialog: (dialog) => set({ dialog })
}))

function applyAutoDatesOnScan(scan: ScanResult): void {
  const { updateMeta } = useApp.getState()
  updateMeta((m) => withAutoDates(m, scan.files))
}
