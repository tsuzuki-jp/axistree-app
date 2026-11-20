import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { RecentWorkspaces } from '@shared/ipc'

/** Per-user app settings (not per-workspace): the recently opened workspace folders. */
const configPath = (): string => path.join(app.getPath('userData'), 'config.json')
const MAX_RECENT = 8

async function readConfig(): Promise<RecentWorkspaces> {
  try {
    const raw = JSON.parse(await fs.readFile(configPath(), 'utf8'))
    const recent = Array.isArray(raw.recent) ? raw.recent.filter((r: unknown) => typeof r === 'string') : []
    return { last: typeof raw.last === 'string' ? raw.last : null, recent }
  } catch {
    return { last: null, recent: [] }
  }
}

export async function getRecentWorkspaces(): Promise<RecentWorkspaces> {
  const cfg = await readConfig()
  const exists = async (p: string): Promise<boolean> =>
    fs.stat(p).then((s) => s.isDirectory(), () => false)
  const recent: string[] = []
  for (const r of cfg.recent) if (await exists(r)) recent.push(r)
  const last = cfg.last && (await exists(cfg.last)) ? cfg.last : null
  return { last, recent }
}

export async function rememberWorkspace(root: string): Promise<void> {
  const cfg = await readConfig()
  const recent = [root, ...cfg.recent.filter((r) => r !== root)].slice(0, MAX_RECENT)
  await fs.mkdir(path.dirname(configPath()), { recursive: true })
  await fs.writeFile(configPath(), JSON.stringify({ last: root, recent }, null, 2), 'utf8')
}
