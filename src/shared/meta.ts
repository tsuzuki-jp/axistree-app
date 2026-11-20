import { parseAxisPath, pathsEqual } from './axisPath'
import type { AxisPath, AxisTreeMeta, AxisTreeSettings, FileClassification } from './types'

export const META_FILENAME = '.axistree.json'
export const DEFAULT_AXES = ['Date', 'Project', 'Content']

export const DEFAULT_SETTINGS: AxisTreeSettings = {
  dateAxis: 'Date',
  autoDateOnCreate: true,
  autoDateOnScan: false,
  dateSource: 'birthtime'
}

export function createDefaultMeta(): AxisTreeMeta {
  return { version: 1, axes: [...DEFAULT_AXES], settings: { ...DEFAULT_SETTINGS }, files: {} }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Accepts the forms a person might hand-write for one axis:
 *   [["2026","11","20"], ["2025"]]   (canonical)
 *   ["2026","11","20"]               (a single path)
 *   "2026/11/20" or ["a/b", "c/d"]   (slash strings)
 */
function normalizePathList(value: unknown): AxisPath[] {
  let candidates: unknown[]
  if (typeof value === 'string') candidates = [value]
  else if (!Array.isArray(value)) return []
  else if (value.length > 0 && value.every((v) => typeof v === 'string') && !value.some((v) => v.includes('/')))
    candidates = [value]
  else candidates = value

  const out: AxisPath[] = []
  for (const c of candidates) {
    let path: AxisPath
    if (typeof c === 'string') path = parseAxisPath(c)
    else if (Array.isArray(c)) path = c.filter((s): s is string => typeof s === 'string').flatMap(parseAxisPath)
    else continue
    if (path.length > 0 && !out.some((p) => pathsEqual(p, path))) out.push(path)
  }
  return out
}

/** Turn arbitrary JSON into a valid AxisTreeMeta, keeping whatever data is usable. */
export function normalizeMeta(raw: unknown): AxisTreeMeta {
  const meta = createDefaultMeta()
  if (!isRecord(raw)) return meta

  if (Array.isArray(raw.axes)) {
    const axes = raw.axes
      .filter((a): a is string => typeof a === 'string')
      .map((a) => a.trim())
      .filter((a) => a.length > 0)
    meta.axes = [...new Set(axes)]
  }

  if (isRecord(raw.settings)) {
    const s = raw.settings
    if (typeof s.dateAxis === 'string' && s.dateAxis.trim()) meta.settings.dateAxis = s.dateAxis.trim()
    if (typeof s.autoDateOnCreate === 'boolean') meta.settings.autoDateOnCreate = s.autoDateOnCreate
    if (typeof s.autoDateOnScan === 'boolean') meta.settings.autoDateOnScan = s.autoDateOnScan
    if (s.dateSource === 'birthtime' || s.dateSource === 'mtime') meta.settings.dateSource = s.dateSource
  }

  if (isRecord(raw.files)) {
    for (const [rel, cls] of Object.entries(raw.files)) {
      if (!isRecord(cls)) continue
      const key = rel.replace(/\\/g, '/')
      const out: FileClassification = {}
      for (const [axis, value] of Object.entries(cls)) {
        const name = axis.trim()
        const paths = normalizePathList(value)
        if (name && paths.length > 0) out[name] = paths
        // An axis only referenced from file data still deserves a tab.
        if (name && paths.length > 0 && !meta.axes.includes(name)) meta.axes.push(name)
      }
      if (Object.keys(out).length > 0) meta.files[key] = out
    }
  }
  return meta
}

export function getPaths(meta: AxisTreeMeta, rel: string, axis: string): AxisPath[] {
  return meta.files[rel]?.[axis] ?? []
}

/** Replace the path list of one file/axis, dropping empty containers. Returns a new meta. */
export function setPaths(meta: AxisTreeMeta, rel: string, axis: string, paths: AxisPath[]): AxisTreeMeta {
  const files = { ...meta.files }
  const cls: FileClassification = { ...(files[rel] ?? {}) }
  const unique: AxisPath[] = []
  for (const p of paths) if (p.length > 0 && !unique.some((u) => pathsEqual(u, p))) unique.push(p)
  if (unique.length > 0) cls[axis] = unique
  else delete cls[axis]
  if (Object.keys(cls).length > 0) files[rel] = cls
  else delete files[rel]
  const axes = meta.axes.includes(axis) || unique.length === 0 ? meta.axes : [...meta.axes, axis]
  return { ...meta, axes, files }
}

export function addPath(meta: AxisTreeMeta, rel: string, axis: string, path: AxisPath): AxisTreeMeta {
  return setPaths(meta, rel, axis, [...getPaths(meta, rel, axis), path])
}

export function removePathAt(meta: AxisTreeMeta, rel: string, axis: string, index: number): AxisTreeMeta {
  return setPaths(
    meta,
    rel,
    axis,
    getPaths(meta, rel, axis).filter((_, i) => i !== index)
  )
}

export function replacePathAt(
  meta: AxisTreeMeta,
  rel: string,
  axis: string,
  index: number,
  path: AxisPath
): AxisTreeMeta {
  const next = getPaths(meta, rel, axis).map((p, i) => (i === index ? path : p))
  return setPaths(meta, rel, axis, next)
}

export function addAxis(meta: AxisTreeMeta, name: string): AxisTreeMeta {
  const n = name.trim()
  if (!n || meta.axes.includes(n)) return meta
  return { ...meta, axes: [...meta.axes, n] }
}

/** Remove an axis and every path stored under it. */
export function removeAxis(meta: AxisTreeMeta, name: string): AxisTreeMeta {
  const files: AxisTreeMeta['files'] = {}
  for (const [rel, cls] of Object.entries(meta.files)) {
    const { [name]: _removed, ...rest } = cls
    if (Object.keys(rest).length > 0) files[rel] = rest
  }
  return { ...meta, axes: meta.axes.filter((a) => a !== name), files }
}

export function renameAxis(meta: AxisTreeMeta, from: string, to: string): AxisTreeMeta {
  const target = to.trim()
  if (!target || from === target || meta.axes.includes(target)) return meta
  const files: AxisTreeMeta['files'] = {}
  for (const [rel, cls] of Object.entries(meta.files)) {
    const next: FileClassification = {}
    for (const [axis, paths] of Object.entries(cls)) next[axis === from ? target : axis] = paths
    files[rel] = next
  }
  const settings =
    meta.settings.dateAxis === from ? { ...meta.settings, dateAxis: target } : meta.settings
  return { ...meta, axes: meta.axes.map((a) => (a === from ? target : a)), settings, files }
}

export function moveAxis(meta: AxisTreeMeta, name: string, delta: -1 | 1): AxisTreeMeta {
  const i = meta.axes.indexOf(name)
  const j = i + delta
  if (i < 0 || j < 0 || j >= meta.axes.length) return meta
  const axes = [...meta.axes]
  ;[axes[i], axes[j]] = [axes[j], axes[i]]
  return { ...meta, axes }
}

/** Metadata keys that no longer correspond to a file on disk. */
export function findOrphans(meta: AxisTreeMeta, existing: Set<string>): string[] {
  return Object.keys(meta.files).filter((rel) => !existing.has(rel))
}

export function removeFiles(meta: AxisTreeMeta, rels: string[]): AxisTreeMeta {
  if (rels.length === 0) return meta
  const files = { ...meta.files }
  for (const rel of rels) delete files[rel]
  return { ...meta, files }
}

export function serializeMeta(meta: AxisTreeMeta): string {
  return JSON.stringify(meta, null, 2) + '\n'
}
