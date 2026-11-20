import { useCallback, useEffect, useRef, useState } from 'react'
import { FilePlus, FolderOpen, Layers, RefreshCw, Settings } from 'lucide-react'
import type { RecentWorkspaces } from '@shared/ipc'
import type { WorkspaceSnapshot } from '@shared/types'
import { api, errorMessage } from './lib/api'
import { flushAll } from './lib/flush'
import { loadPref, savePref } from './lib/storage'
import { useApp } from './store'
import { Explorer } from './components/Explorer'
import { Inspector } from './components/Inspector'
import { NewFileDialog } from './components/NewFileDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { Splitter } from './components/Splitter'
import { Toasts } from './components/Toasts'
import { Viewer } from './components/Viewer'
import { WelcomeScreen } from './components/WelcomeScreen'
import { Button, IconButton } from './components/ui'

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export default function App() {
  const workspace = useApp((s) => s.workspace)
  const dialog = useApp((s) => s.dialog)
  const [recent, setRecent] = useState<RecentWorkspaces>({ last: null, recent: [] })
  const [busy, setBusy] = useState(false)
  const [booted, setBooted] = useState(false)

  const open = useCallback(async (fn: () => Promise<WorkspaceSnapshot | null>) => {
    setBusy(true)
    try {
      await flushAll()
      const snap = await fn()
      if (snap) useApp.getState().loadSnapshot(snap)
    } catch (err) {
      useApp.getState().toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
      api.recentWorkspaces().then(setRecent, () => undefined)
    }
  }, [])

  // Main-process events.
  useEffect(() => {
    const offs = [
      api.onWorkspaceChanged((c) => useApp.getState().applyChange(c)),
      api.onMetaChanged((m) => useApp.getState().receiveMetaFromDisk(m)),
      api.onFlushRequest(() => flushAll())
    ]
    return () => offs.forEach((off) => off())
  }, [])

  // Re-open the last workspace on launch.
  useEffect(() => {
    api
      .recentWorkspaces()
      .then(async (r) => {
        setRecent(r)
        if (r.last) await open(() => api.openWorkspace(r.last!))
      })
      .catch(() => undefined)
      .finally(() => setBooted(true))
  }, [open])

  if (!booted) return <div className="h-full bg-app" />

  return (
    <div className="flex h-full flex-col">
      {workspace ? (
        <Workbench onSwitch={() => void open(() => api.selectWorkspace())} busy={busy} />
      ) : (
        <WelcomeScreen
          recent={recent.recent}
          busy={busy}
          onSelect={() => void open(() => api.selectWorkspace())}
          onOpenRecent={(root) => void open(() => api.openWorkspace(root))}
        />
      )}
      {dialog === 'newFile' && <NewFileDialog />}
      {dialog === 'settings' && <SettingsDialog />}
      <Toasts />
    </div>
  )
}

function Workbench({ onSwitch, busy }: { onSwitch: () => void; busy: boolean }) {
  const workspace = useApp((s) => s.workspace)!
  const fileCount = useApp((s) => s.files.length)
  const openDialog = useApp((s) => s.openDialog)
  const applyChange = useApp((s) => s.applyChange)
  const toast = useApp((s) => s.toast)
  const [left, setLeft] = useState(() => loadPref('leftWidth', 290))
  const [right, setRight] = useState(() => loadPref('rightWidth', 320))
  const start = useRef({ left, right })
  // Latest widths for the drag-end handler, which was captured when the drag started.
  const widths = useRef({ left, right })
  widths.current = { left, right }

  const rescan = async (): Promise<void> => {
    try {
      applyChange({ scan: await api.rescan(), updated: [], changed: [] })
      toast('再スキャンしました')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  // Ctrl/Cmd+N: new Markdown file.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && !e.shiftKey) {
        e.preventDefault()
        openDialog('newFile')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openDialog])

  return (
    <>
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-app px-3">
        <Layers className="size-4 text-accent" />
        <span className="text-[12px] font-semibold">AxisTree</span>
        <span className="text-faint">/</span>
        <button
          onClick={onSwitch}
          disabled={busy}
          title={`${workspace.root}\nクリックして別のフォルダを開く`}
          className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[12px] hover:bg-hover"
        >
          <FolderOpen className="size-3.5 shrink-0 text-muted" />
          <span className="truncate font-medium">{workspace.name}</span>
        </button>
        <span className="text-[11px] text-faint tabular-nums">{fileCount} ファイル</span>
        <div className="flex-1" />
        <IconButton label="再スキャン" onClick={() => void rescan()}>
          <RefreshCw className="size-3.5" />
        </IconButton>
        <IconButton label="分類軸と設定" onClick={() => openDialog('settings')}>
          <Settings className="size-3.5" />
        </IconButton>
        <Button variant="primary" onClick={() => openDialog('newFile')} title="新規 Markdown (Ctrl+N)">
          <FilePlus className="size-3.5" />
          新規
        </Button>
      </header>
      <main className="flex min-h-0 flex-1">
        <aside style={{ width: left }} className="min-w-0 shrink-0" aria-label="エクスプローラー">
          <Explorer />
        </aside>
        <Splitter
          onDragStart={() => (start.current = { left, right })}
          onDrag={(dx) => setLeft(clamp(start.current.left + dx, 200, 520))}
          onDragEnd={() => savePref('leftWidth', widths.current.left)}
        />
        <section className="min-w-0 flex-1" aria-label="プレビュー">
          <Viewer />
        </section>
        <Splitter
          onDragStart={() => (start.current = { left, right })}
          onDrag={(dx) => setRight(clamp(start.current.right - dx, 240, 520))}
          onDragEnd={() => savePref('rightWidth', widths.current.right)}
        />
        <aside style={{ width: right }} className="min-w-0 shrink-0" aria-label="分類インスペクター">
          <Inspector />
        </aside>
      </main>
    </>
  )
}
