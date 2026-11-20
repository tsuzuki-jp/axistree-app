import type { AxisPath } from './types'

/** "Project_A / chapter_1/" -> ["Project_A", "chapter_1"] */
export function parseAxisPath(input: string): AxisPath {
  return input
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function formatAxisPath(path: AxisPath): string {
  return path.join('/')
}

export function pathsEqual(a: AxisPath, b: AxisPath): boolean {
  return a.length === b.length && a.every((seg, i) => seg === b[i])
}

/** True when `prefix` is an ancestor of (or equal to) `path`. */
export function isPrefixOf(prefix: AxisPath, path: AxisPath): boolean {
  return prefix.length <= path.length && prefix.every((seg, i) => seg === path[i])
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** Local-time date path: ["2026", "11", "20"]. */
export function dateToAxisPath(ms: number): AxisPath {
  const d = new Date(ms)
  return [String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate())]
}
