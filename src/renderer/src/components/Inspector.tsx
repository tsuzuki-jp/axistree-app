import { useMemo, useState } from 'react'
import { ChevronRight, Pencil, Plus, X } from 'lucide-react'
import { dateToAxisPath, formatAxisPath } from '@shared/axisPath'
import { addPath, removePathAt, replacePathAt } from '@shared/meta'
import type { AxisPath, FileEntry } from '@shared/types'
import { formatDateTime, formatSize } from '../lib/format'
import { useApp } from '../store'
import { FileIcon } from './FileIcon'
import { PathInput } from './PathInput'

export function Inspector() {
  const file = useApp((s) => (s.selectedFile ? s.fileMap.get(s.selectedFile) : undefined))
  const axes = useApp((s) => s.meta.axes)

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
        {axes.map((axis) => (
          <AxisSection key={axis} axis={axis} file={file} />
        ))}
      </div>
    </div>
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

function AxisSection({ axis, file }: { axis: string; file: FileEntry }) {
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
        <h3 className="min-w-0 flex-1 truncate text-[12px] font-semibold">{axis}</h3>
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
          autoFocus={adding}
          placeholder={isDateAxis ? '例: 2026/11/20' : `例: ${axis === 'Project' ? 'Project_A/chapter_1' : 'Study/CFD'}`}
          onSubmit={(p) => {
            add(p)
            setAdding(false)
          }}
          onCancel={paths.length > 0 ? () => setAdding(false) : undefined}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex h-6 items-center gap-1 rounded px-1 text-[12px] text-muted hover:bg-hover hover:text-fg"
        >
          <Plus className="size-3.5" />
          パスを追加
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
