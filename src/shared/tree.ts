import { dateToAxisPath } from './axisPath'
import type { AxisPath, AxisTreeMeta, FileEntry } from './types'

/** Pseudo-axis that shows the physical directory layout. */
export const FS_AXIS = '\u0000fs'
export const UNCATEGORIZED_LABEL = '(未分類)'
/** Folder key of the uncategorized bucket; cannot collide with real keys (those never contain NUL). */
export const UNCATEGORIZED_KEY = '\u0000uncategorized'

export interface TreeFolder {
  /** Unique within one axis tree: path joined by "/", or UNCATEGORIZED_KEY. */
  key: string
  name: string
  path: AxisPath
  folders: TreeFolder[]
  files: FileEntry[]
  /** Number of distinct files anywhere below this folder. */
  count: number
  uncategorized?: boolean
}

const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' })

interface Builder {
  node: TreeFolder
  children: Map<string, Builder>
  files: Map<string, FileEntry>
  all: Set<string>
}

function newBuilder(name: string, path: AxisPath, key: string): Builder {
  return {
    node: { key, name, path, folders: [], files: [], count: 0 },
    children: new Map(),
    files: new Map(),
    all: new Set()
  }
}

function insert(root: Builder, path: AxisPath, file: FileEntry, createEmptyOnly = false): void {
  let cur = root
  if (!createEmptyOnly) cur.all.add(file.relPath)
  for (let i = 0; i < path.length; i++) {
    const seg = path[i]
    let next = cur.children.get(seg)
    if (!next) {
      const p = path.slice(0, i + 1)
      next = newBuilder(seg, p, p.join('/'))
      cur.children.set(seg, next)
    }
    cur = next
    if (!createEmptyOnly) cur.all.add(file.relPath)
  }
  if (!createEmptyOnly) cur.files.set(file.relPath, file)
}

function finalize(b: Builder): TreeFolder {
  const folders = [...b.children.values()].map(finalize).sort((x, y) => collator.compare(x.name, y.name))
  const files = [...b.files.values()].sort((x, y) => collator.compare(x.name, y.name))
  return { ...b.node, folders, files, count: b.all.size }
}

/** Build the folder tree for one classification axis. Unclassified files go to "(未分類)". */
export function buildAxisTree(files: FileEntry[], meta: AxisTreeMeta, axis: string): TreeFolder {
  const root = newBuilder(axis, [], '')
  const uncategorized: FileEntry[] = []
  for (const f of files) {
    const paths = meta.files[f.relPath]?.[axis]
    if (!paths || paths.length === 0) {
      uncategorized.push(f)
      continue
    }
    for (const p of paths) insert(root, p, f)
  }
  const tree = finalize(root)
  if (uncategorized.length > 0) {
    tree.folders.push({
      key: UNCATEGORIZED_KEY,
      name: UNCATEGORIZED_LABEL,
      path: [],
      folders: [],
      files: uncategorized.sort((x, y) => collator.compare(x.name, y.name)),
      count: uncategorized.length,
      uncategorized: true
    })
    tree.count += uncategorized.length
  }
  return tree
}

/** Build the physical directory tree (empty directories included). */
export function buildFsTree(files: FileEntry[], dirs: string[], rootName: string): TreeFolder {
  const root = newBuilder(rootName, [], '')
  const placeholder = { relPath: '' } as FileEntry
  for (const d of dirs) insert(root, d.split('/'), placeholder, true)
  for (const f of files) insert(root, f.relPath.split('/').slice(0, -1), f)
  return finalize(root)
}

/** Keep only files matching `query` (case-insensitive, on file name or path) and their ancestors. */
export function filterTree(tree: TreeFolder, query: string): TreeFolder {
  const q = query.trim().toLowerCase()
  if (!q) return tree
  const walk = (node: TreeFolder): TreeFolder | null => {
    const files = node.files.filter((f) => f.relPath.toLowerCase().includes(q))
    const folders = node.folders.map(walk).filter((n): n is TreeFolder => n !== null)
    if (files.length === 0 && folders.length === 0) return null
    const ids = new Set(files.map((f) => f.relPath))
    const countOf = (n: TreeFolder): void => {
      n.files.forEach((f) => ids.add(f.relPath))
      n.folders.forEach(countOf)
    }
    folders.forEach(countOf)
    return { ...node, files, folders, count: ids.size }
  }
  return walk(tree) ?? { ...tree, files: [], folders: [], count: 0 }
}

/** Every folder key in the tree (for "expand all"). */
export function allFolderKeys(tree: TreeFolder): string[] {
  const out: string[] = []
  const walk = (n: TreeFolder): void => {
    for (const f of n.folders) {
      out.push(f.key)
      walk(f)
    }
  }
  walk(tree)
  return out
}

/** Folder keys that must be expanded for a path to be visible. */
export function ancestorKeys(path: AxisPath): string[] {
  return path.map((_, i) => path.slice(0, i + 1).join('/'))
}

/** Axis -> distinct path prefixes ("a", "a/b", ...) with the number of files below each. */
export function collectPrefixes(meta: AxisTreeMeta, axis: string): Map<string, number> {
  const counts = new Map<string, Set<string>>()
  for (const [rel, cls] of Object.entries(meta.files)) {
    for (const path of cls[axis] ?? []) {
      for (let i = 1; i <= path.length; i++) {
        const key = path.slice(0, i).join('/')
        let set = counts.get(key)
        if (!set) counts.set(key, (set = new Set()))
        set.add(rel)
      }
    }
  }
  return new Map([...counts].map(([k, s]) => [k, s.size]))
}

/**
 * Autocomplete candidates for an axis path being typed.
 * Prefix matches rank before substring matches; shallower and more-used paths first.
 */
export function suggestPaths(
  prefixes: Map<string, number>,
  input: string,
  exclude: Set<string> = new Set(),
  limit = 8
): string[] {
  const raw = input.replace(/^\s*\/+/, '')
  const q = raw.toLowerCase()
  const depth = (s: string): number => s.split('/').length
  const scored: { value: string; rank: number }[] = []
  for (const [value, count] of prefixes) {
    if (exclude.has(value)) continue
    const v = value.toLowerCase()
    if (q && v === q.replace(/\/+$/, '')) continue
    let tier: number
    if (!q || v.startsWith(q)) tier = 0
    else if (v.includes(q)) tier = 1
    else continue
    scored.push({ value, rank: tier * 1e9 + depth(value) * 1e6 - Math.min(count, 999_999) })
  }
  scored.sort((a, b) => a.rank - b.rank || collator.compare(a.value, b.value))
  return scored.slice(0, limit).map((s) => s.value)
}

/** Date-axis path for a file based on the chosen timestamp. */
export function autoDatePath(file: FileEntry, source: 'birthtime' | 'mtime'): AxisPath {
  return dateToAxisPath(source === 'birthtime' ? file.birthtimeMs : file.mtimeMs)
}
