import { promises as fs, type Stats } from 'node:fs'
import path from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import { META_FILENAME, createDefaultMeta, normalizeMeta, serializeMeta } from '@shared/meta'
import { extOf } from '@shared/fileKind'
import { isIgnoredName } from '@shared/relPath'
import type { WorkspaceChange } from '@shared/ipc'
import type { AxisTreeMeta, FileEntry, ScanResult } from '@shared/types'

const MAX_TEXT_BYTES = 20 * 1024 * 1024
const STAT_BATCH = 64

export function toEntry(relPath: string, st: Stats): FileEntry {
  const name = relPath.slice(relPath.lastIndexOf('/') + 1)
  // Some filesystems report birthtime as 0 (epoch); fall back to mtime there.
  const birth = st.birthtimeMs > 0 ? st.birthtimeMs : st.mtimeMs
  return { relPath, name, ext: extOf(name), size: st.size, mtimeMs: st.mtimeMs, birthtimeMs: birth }
}

export interface WorkspaceEvents {
  onChange(change: WorkspaceChange): void
  onMetaChange(meta: AxisTreeMeta): void
}

/** One opened root folder: path safety, scanning, watching and `.axistree.json` persistence. */
export class Workspace {
  private watcher: FSWatcher | null = null
  private pending = new Map<string, string>()
  private flushTimer: NodeJS.Timeout | null = null
  private lastMetaText: string | null = null
  /** Texts we wrote recently; watcher events for them are our own echo, not external edits. */
  private recentMetaWrites: string[] = []
  private metaWrite: Promise<void> = Promise.resolve()

  /** `root` must already be a realpath. */
  constructor(readonly root: string) {}

  get metaPath(): string {
    return path.join(this.root, META_FILENAME)
  }

  // ---------------------------------------------------------------- path safety

  private isInside(abs: string): boolean {
    const r = path.relative(this.root, abs)
    return r === '' || (!r.startsWith('..' + path.sep) && r !== '..' && !path.isAbsolute(r))
  }

  /**
   * Map a renderer-supplied relative path to an absolute one, refusing anything that escapes the
   * workspace (via "..", absolute paths, or symlinks) or touches hidden/ignored entries.
   */
  async resolve(rel: unknown, opts: { mustExist: boolean }): Promise<string> {
    if (typeof rel !== 'string' || rel.length === 0 || rel.includes('\0')) throw new Error('不正なパスです')
    const segs = rel.split(/[\\/]/)
    if (segs.some((s) => s === '..' || isIgnoredName(s))) throw new Error(`アクセスできないパスです: ${rel}`)
    const abs = path.resolve(this.root, ...segs)
    if (!this.isInside(abs) || abs === this.root) throw new Error(`ワークスペース外のパスです: ${rel}`)

    // Follow symlinks on the nearest existing ancestor to make sure we stay inside.
    let probe = abs
    for (;;) {
      try {
        const real = await fs.realpath(probe)
        if (!this.isInside(real)) throw new Error(`ワークスペース外のパスです: ${rel}`)
        break
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
        if (opts.mustExist && probe === abs) throw new Error(`ファイルが見つかりません: ${rel}`)
        probe = path.dirname(probe)
      }
    }
    return abs
  }

  // ---------------------------------------------------------------- scanning

  async scan(): Promise<ScanResult> {
    const files: FileEntry[] = []
    const dirs: string[] = []
    const walk = async (absDir: string, relDir: string): Promise<void> => {
      let entries
      try {
        entries = await fs.readdir(absDir, { withFileTypes: true })
      } catch {
        return
      }
      const fileEntries: string[] = []
      const subdirs: string[] = []
      for (const e of entries) {
        if (isIgnoredName(e.name)) continue
        // Symlinks are skipped: they can point outside the workspace or form cycles.
        if (e.isDirectory()) subdirs.push(e.name)
        else if (e.isFile()) fileEntries.push(e.name)
      }
      for (let i = 0; i < fileEntries.length; i += STAT_BATCH) {
        const batch = fileEntries.slice(i, i + STAT_BATCH)
        const stats = await Promise.all(
          batch.map((n) => fs.stat(path.join(absDir, n)).catch(() => null))
        )
        stats.forEach((st, j) => {
          if (st) files.push(toEntry(relDir ? `${relDir}/${batch[j]}` : batch[j], st))
        })
      }
      for (const d of subdirs) {
        const rel = relDir ? `${relDir}/${d}` : d
        dirs.push(rel)
        await walk(path.join(absDir, d), rel)
      }
    }
    await walk(this.root, '')
    return { files, dirs }
  }

  async statEntry(rel: string): Promise<FileEntry> {
    const abs = await this.resolve(rel, { mustExist: true })
    return toEntry(rel, await fs.stat(abs))
  }

  // ---------------------------------------------------------------- file IO

  async readText(rel: unknown): Promise<string> {
    const abs = await this.resolve(rel, { mustExist: true })
    const st = await fs.stat(abs)
    if (st.size > MAX_TEXT_BYTES) throw new Error('ファイルが大きすぎて開けません (20MB 超)')
    return fs.readFile(abs, 'utf8')
  }

  /** In-place write (not rename) so the file keeps its inode and creation time. */
  async writeText(rel: unknown, content: unknown): Promise<FileEntry> {
    if (typeof content !== 'string') throw new Error('不正な内容です')
    const abs = await this.resolve(rel, { mustExist: true })
    await fs.writeFile(abs, content, 'utf8')
    return toEntry(rel as string, await fs.stat(abs))
  }

  async createFile(rel: unknown, content: unknown): Promise<FileEntry> {
    if (typeof content !== 'string') throw new Error('不正な内容です')
    const abs = await this.resolve(rel, { mustExist: false })
    await fs.mkdir(path.dirname(abs), { recursive: true })
    try {
      await fs.writeFile(abs, content, { encoding: 'utf8', flag: 'wx' })
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('同名のファイルが既に存在します')
      throw e
    }
    return toEntry(rel as string, await fs.stat(abs))
  }

  // ---------------------------------------------------------------- metadata

  /**
   * Load `.axistree.json`, creating it when absent. A file that is not valid JSON is moved aside
   * (never overwritten) so hand edits are not lost.
   */
  async loadMeta(): Promise<{ meta: AxisTreeMeta; warning?: string }> {
    let text: string
    try {
      text = await fs.readFile(this.metaPath, 'utf8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      const meta = createDefaultMeta()
      await this.saveMeta(meta)
      return { meta }
    }
    try {
      const meta = normalizeMeta(JSON.parse(text))
      this.lastMetaText = text
      return { meta }
    } catch {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backup = `${META_FILENAME}.broken-${stamp}`
      await fs.rename(this.metaPath, path.join(this.root, backup))
      const meta = createDefaultMeta()
      await this.saveMeta(meta)
      return {
        meta,
        warning: `${META_FILENAME} を読み込めなかったため ${backup} に退避し、新しく作成しました。`
      }
    }
  }

  /** Atomic write (temp file + rename); writes are serialized. */
  saveMeta(raw: unknown): Promise<void> {
    const meta = normalizeMeta(raw)
    const text = serializeMeta(meta)
    const run = async (): Promise<void> => {
      if (text === this.lastMetaText) return
      const tmp = `${this.metaPath}.tmp-${process.pid}`
      await fs.writeFile(tmp, text, 'utf8')
      await fs.rename(tmp, this.metaPath)
      this.lastMetaText = text
      this.recentMetaWrites = [...this.recentMetaWrites.slice(-9), text]
    }
    this.metaWrite = this.metaWrite.then(run, run)
    return this.metaWrite
  }

  private async checkExternalMetaEdit(events: WorkspaceEvents): Promise<void> {
    let text: string
    try {
      text = await fs.readFile(this.metaPath, 'utf8')
    } catch {
      return
    }
    await this.metaWrite.catch(() => undefined)
    if (text === this.lastMetaText || this.recentMetaWrites.includes(text)) return
    try {
      const meta = normalizeMeta(JSON.parse(text))
      this.lastMetaText = text
      events.onMetaChange(meta)
    } catch {
      // Half-written or invalid hand edit: ignore until it becomes valid JSON.
    }
  }

  // ---------------------------------------------------------------- watching

  startWatching(events: WorkspaceEvents): void {
    this.watcher = watch(this.root, {
      ignoreInitial: true,
      followSymlinks: false,
      ignored: (p: string) => {
        const rel = path.relative(this.root, p)
        if (!rel || rel === META_FILENAME) return false
        return rel.split(path.sep).some(isIgnoredName)
      }
    })
    this.watcher.on('all', (event, p) => {
      const rel = path.relative(this.root, p).split(path.sep).join('/')
      if (rel === META_FILENAME) {
        void this.checkExternalMetaEdit(events)
        return
      }
      if (!rel) return
      // Remember the strongest event per path within the debounce window.
      const prev = this.pending.get(rel)
      this.pending.set(rel, prev && prev !== 'change' ? prev : event)
      if (this.flushTimer) clearTimeout(this.flushTimer)
      this.flushTimer = setTimeout(() => void this.flushChanges(events), 250)
    })
    this.watcher.on('error', (err) => console.error('[watcher]', err))
  }

  private async flushChanges(events: WorkspaceEvents): Promise<void> {
    const batch = this.pending
    this.pending = new Map()
    this.flushTimer = null
    const changed = [...batch].filter(([, e]) => e === 'change').map(([rel]) => rel)
    const structural = [...batch.values()].some((e) => e !== 'change')
    if (structural) {
      events.onChange({ scan: await this.scan(), updated: [], changed })
      return
    }
    const updated = (await Promise.all(changed.map((rel) => this.statEntry(rel).catch(() => null)))).filter(
      (e): e is FileEntry => e !== null
    )
    events.onChange({ updated, changed })
  }

  async close(): Promise<void> {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    await this.watcher?.close()
    this.watcher = null
    await this.metaWrite.catch(() => undefined)
  }
}
