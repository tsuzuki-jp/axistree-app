import { useMemo, useState } from 'react'
import { CalendarDays, ChevronRight, Pencil, Plus, Settings, Tags, X } from 'lucide-react'
import { dateToAxisPath, formatAxisPath } from '@shared/axisPath'
import { addAxis, addPath, axisUsage, removePathAt, replacePathAt } from '@shared/meta'
import type { AxisPath, FileEntry } from '@shared/types'
import { formatDateTime, formatSize } from '../lib/format'
import { useApp } from '../store'
import { FileIcon } from './FileIcon'
import { PathInput } from './PathInput'
import { Dropdown, MenuAction, SearchMenu } from './SearchMenu'

export function Inspector() {
  const file = useApp((s) => (s.selectedFile ? s.fileMap.get(s.selectedFile) : undefined))

  if (!file) {
    return (
      <div className="flex h-full flex-col bg-panel">
        <PaneTitle>分類</PaneTitle>
        <p className="px-4 py-6 text-[12px] leading-relaxed text-faint">
          ファイルを選択すると、各分類軸のパスをここで追加・編集できます。
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <PaneTitle>分類</PaneTitle>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FileSummary file={file} />
        <FileAxes key={file.relPath} file={file} />
      </div>
    </div>
  )
}

/**
 * Shows only the axes this file uses (plus the date axis), so the pane stays short no matter how
 * many axes exist. Other axes are added from a searchable picker, which can also create new axes.
 */
function FileAxes({ file }: { file: FileEntry }) {
  const meta = useApp((s) => s.meta)
  const updateMeta = useApp((s) => s.updateMeta)
  const openDialog = useApp((s) => s.openDialog)
  const cls = meta.files[file.relPath]
  // Axes stay visible for as long as this file is selected, even after their last path is removed.
  const [pinned, setPinned] = useState(() => new Set(Object.keys(cls ?? {})))
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const usage = useMemo(() => axisUsage(meta), [meta])

  const visible = meta.axes.filter(
    (a) => a === meta.settings.dateAxis || (cls?.[a]?.length ?? 0) > 0 || pinned.has(a)
  )
  const hidden = meta.axes.filter((a) => !visible.includes(a))

  const show = (axis: string): void => {
    setPinned((p) => new Set(p).add(axis))
    setJustAdded(axis)
  }
  const dismiss = (axis: string): void => {
    setPinned((p) => {
      const next = new Set(p)
      next.delete(axis)
      return next
    })
    if (justAdded === axis) setJustAdded(null)
  }

  return (
    <>
      {visible.map((axis) => (
        <AxisSection
          key={axis}
          axis={axis}
          file={file}
          autoFocus={axis === justAdded}
          onDismiss={axis === meta.settings.dateAxis ? undefined : () => dismiss(axis)}
        />
      ))}
      <div className="px-4 py-3">
        <Dropdown
          panelClassName="left-0 right-0"
          trigger={({ open, toggle }) => (
            <button
              onClick={toggle}
              aria-haspopup="listbox"
              aria-expanded={open}
              className={`flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed text-[12px] transition-colors ${
                open ? 'border-accent text-accent' : 'border-line text-muted hover:border-accent hover:text-accent'
              }`}
            >
              <Plus className="size-3.5" />
              分類軸を追加
              {hidden.length > 0 && <span className="text-faint">（他 {hidden.length} 軸）</span>}
            </button>
          )}
        >
          {(close) => (
            <SearchMenu
              items={hidden.map((axis) => ({
                id: axis,
                label: axis,
                icon: <Tags className="size-3.5" />,
                detail: usage.get(axis) ?? 0,
                onSelect: () => show(axis)
              }))}
              placeholder="分類軸を検索・新規作成"
              emptyText={meta.axes.length === visible.length ? '名前を入力して新しい分類軸を作成' : '該当なし'}
              onClose={close}
              onCreate={(name) => {
                updateMeta((m) => addAxis(m, name))
                show(name)
              }}
              canCreate={(q) => !meta.axes.includes(q)}
              createLabel={(q) => `「${q}」を新しい分類軸として追加`}
              footer={
                <MenuAction
                  icon={<Settings className="size-3.5" />}
                  onClick={() => {
                    close()
                    openDialog('settings')
                  }}
                >
                  分類軸を管理…
                </MenuAction>
              }
            />
          )}
        </Dropdown>
      </div>
    </>
  )
}

function PaneTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center border-b border-line px-4 text-[11px] font-semibold tracking-wider text-muted uppercase">
      {children}
    </div>
  )
}

function FileSummary({ file }: { file: FileEntry }) {
  return (
    <div className="border-b border-line px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <FileIcon ext={file.ext} />
        <span className="min-w-0 flex-1 truncate font-semibold" title={file.name}>
          {file.name}
        </span>
      </div>
      <p className="mb-2 font-mono text-[11px] break-all text-muted">{file.relPath}</p>
      <dl className="grid grid-cols-[4rem_1fr] gap-y-0.5 text-[11px]">
        <dt className="text-faint">サイズ</dt>
        <dd className="tabular-nums">{formatSize(file.size)}</dd>
        <dt className="text-faint">作成</dt>
        <dd className="tabular-nums">{formatDateTime(file.birthtimeMs)}</dd>
        <dt className="text-faint">更新</dt>
        <dd className="tabular-nums">{formatDateTime(file.mtimeMs)}</dd>
      </dl>
    </div>
  )
}

function AxisSection({
  axis,
  file,
  autoFocus,
  onDismiss
}: {
  axis: string
  file: FileEntry
  autoFocus: boolean
  /** Hides this (empty) section; absent for the date axis, which is always shown. */
  onDismiss?: () => void
}) {
  const rel = file.relPath
  const paths = useApp((s) => s.meta.files[rel]?.[axis]) ?? NO_PATHS
  const isDateAxis = useApp((s) => s.meta.settings.dateAxis === axis)
  const updateMeta = useApp((s) => s.updateMeta)
  const revealFolder = useApp((s) => s.revealFolder)
  const [editing, setEditing] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const existing = useMemo(() => new Set(paths.map(formatAxisPath)), [paths])

  const add = (p: AxisPath): void => updateMeta((m) => addPath(m, rel, axis, p))

  return (
    <section className="border-b border-line px-4 py-3" aria-label={`${axis} の分類`}>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] font-semibold">
          {isDateAxis ? (
            <CalendarDays className="size-3.5 shrink-0 text-muted" />
          ) : (
            <Tags className="size-3.5 shrink-0 text-muted" />
          )}
          <span className="truncate">{axis}</span>
        </h3>
        {paths.length > 0 && <span className="text-[11px] text-faint tabular-nums">{paths.length}</span>}
      </div>

      {paths.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1">
          {paths.map((p, i) =>
            editing === i ? (
              <li key={`edit-${i}`}>
                <PathInput
                  axis={axis}
                  initial={formatAxisPath(p)}
                  exclude={withoutValue(existing, formatAxisPath(p))}
                  autoFocus
                  onSubmit={(np) => {
                    updateMeta((m) => replacePathAt(m, rel, axis, i, np))
                    setEditing(null)
                  }}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li
                key={formatAxisPath(p)}
                className="group flex min-h-7 items-center gap-1 rounded-md border border-line bg-sunken/60 py-0.5 pr-0.5 pl-1.5"
              >
                <span className="flex min-w-0 flex-1 flex-wrap items-center text-[12px]">
                  {p.map((seg, j) => (
                    <span key={j} className="inline-flex items-center">
                      {j > 0 && <ChevronRight className="size-3 text-faint" />}
                      <button
                        title={`ツリーで ${p.slice(0, j + 1).join(' / ')} を表示`}
                        onClick={() => revealFolder(axis, p.slice(0, j + 1))}
                        className="rounded px-0.5 hover:bg-hover hover:text-accent hover:underline"
                      >
                        {seg}
                      </button>
                    </span>
                  ))}
                </span>
                <button
                  title="編集"
                  aria-label={`${formatAxisPath(p)} を編集`}
                  onClick={() => setEditing(i)}
                  className="inline-flex size-6 items-center justify-center rounded text-faint opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-fg focus:opacity-100"
                >
                  <Pencil className="size-3" />
                </button>
                <button
                  title="削除"
                  aria-label={`${formatAxisPath(p)} を削除`}
                  onClick={() => updateMeta((m) => removePathAt(m, rel, axis, i))}
                  className="inline-flex size-6 items-center justify-center rounded text-faint hover:bg-hover hover:text-danger"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            )
          )}
        </ul>
      )}

      {paths.length === 0 || adding ? (
        <PathInput
          axis={axis}
          exclude={existing}
          autoFocus={adding || autoFocus}
          placeholder={isDateAxis ? '例: 2026/11/20' : '値を入力（/ で階層: 例 親/子）'}
          onSubmit={(p) => {
            add(p)
            setAdding(false)
          }}
          onCancel={paths.length > 0 ? () => setAdding(false) : onDismiss}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex h-6 items-center gap-1 rounded px-1 text-[12px] text-muted hover:bg-hover hover:text-fg"
        >
          <Plus className="size-3.5" />
          値を追加
        </button>
      )}

      {isDateAxis && (
        <div className="mt-2 flex flex-wrap gap-1">
          <DateChip label="作成日" path={dateToAxisPath(file.birthtimeMs)} existing={existing} onAdd={add} />
          <DateChip label="更新日" path={dateToAxisPath(file.mtimeMs)} existing={existing} onAdd={add} />
          <DateChip label="今日" path={dateToAxisPath(Date.now())} existing={existing} onAdd={add} />
        </div>
      )}
    </section>
  )
}

const NO_PATHS: AxisPath[] = []

function withoutValue(set: Set<string>, value: string): Set<string> {
  const next = new Set(set)
  next.delete(value)
  return next
}

function DateChip({
  label,
  path,
  existing,
  onAdd
}: {
  label: string
  path: AxisPath
  existing: Set<string>
  onAdd: (p: AxisPath) => void
}) {
  const value = formatAxisPath(path)
  const has = existing.has(value)
  return (
    <button
      disabled={has}
      onClick={() => onAdd(path)}
      title={has ? '設定済み' : `${value} を追加`}
      className="inline-flex h-6 items-center gap-1 rounded-full border border-line px-2 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted"
    >
      <Plus className="size-3" />
      {label}
      <span className="font-mono text-faint">{value}</span>
    </button>
  )
}
