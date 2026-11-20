/** One classification path inside an axis, e.g. ["Project_A", "chapter_1"]. */
export type AxisPath = string[]

/** A file found in the workspace. `relPath` always uses "/" separators. */
export interface FileEntry {
  relPath: string
  name: string
  /** Lower-case extension without the dot ("" when none). */
  ext: string
  size: number
  mtimeMs: number
  /** Creation time; falls back to mtime on filesystems that do not report it. */
  birthtimeMs: number
}

export interface ScanResult {
  files: FileEntry[]
  /** Relative directory paths ("/" separated), excluding the root itself. */
  dirs: string[]
}

export type DateSource = 'birthtime' | 'mtime'

export interface AxisTreeSettings {
  /** Name of the axis that receives automatic YYYY/MM/DD paths. */
  dateAxis: string
  /** Add a date path to files created from the app. */
  autoDateOnCreate: boolean
  /** Add a date path to every file without one whenever the workspace is scanned. */
  autoDateOnScan: boolean
  /** Which timestamp automatic date paths are derived from. */
  dateSource: DateSource
}

/** Axis name -> list of paths. A file may have several paths in the same axis. */
export type FileClassification = Record<string, AxisPath[]>

/** Shape of `.axistree.json`. */
export interface AxisTreeMeta {
  version: 1
  axes: string[]
  settings: AxisTreeSettings
  /** Keyed by workspace-relative path ("/" separated). */
  files: Record<string, FileClassification>
}

export interface WorkspaceSnapshot {
  root: string
  name: string
  scan: ScanResult
  meta: AxisTreeMeta
  /** Set when an existing `.axistree.json` could not be parsed and was backed up. */
  warning?: string
}
