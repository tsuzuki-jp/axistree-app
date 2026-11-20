import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check as CheckIcon, Pencil, Plus, Trash, X } from 'lucide-react'
import { addAxis, findOrphans, getPaths, moveAxis, removeAxis, removeFiles, renameAxis } from '@shared/meta'
import { FS_AXIS } from '@shared/tree'
import type { DateSource } from '@shared/types'
import { api } from '../lib/api'
import { useApp, withAutoDates } from '../store'
import { Modal } from './Modal'
import { Check } from './NewFileDialog'
import { Button, IconButton } from './ui'

export function SettingsDialog() {
  const openDialog = useApp((s) => s.openDialog)
  const close = (): void => openDialog(null)
  return (
    <Modal title="分類軸と設定" onClose={close} width="max-w-xl" footer={<Button onClick={close}>閉じる</Button>}>
      <div className="flex flex-col gap-6">
        <AxesSection />
        <DateSection />
        <MaintenanceSection />
      </div>
    </Modal>
  )
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2">
      <h3 className="text-[12px] font-semibold">{children}</h3>
      {hint && <p className="text-[11px] text-faint">{hint}</p>}
    </div>
  )
}

function AxesSection() {
  const meta = useApp((s) => s.meta)
  const updateMeta = useApp((s) => s.updateMeta)
  const activeAxis = useApp((s) => s.activeAxis)
  const setActiveAxis = useApp((s) => s.setActiveAxis)
  const [newAxis, setNewAxis] = useState('')
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null)

  const usage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const cls of Object.values(meta.files))
      for (const axis of Object.keys(cls)) counts.set(axis, (counts.get(axis) ?? 0) + 1)
    return counts
  }, [meta.files])

  const trimmed = newAxis.trim()
  const addError = trimmed && meta.axes.includes(trimmed) ? '同名の軸が既にあります' : null

  const submitRename = (): void => {
    if (!renaming) return
    const to = renaming.to.trim()
    if (to && to !== renaming.from && !meta.axes.includes(to)) {
      updateMeta((m) => renameAxis(m, renaming.from, to))
      if (activeAxis === renaming.from) setActiveAxis(to)
    }
    setRenaming(null)
  }

  const remove = async (axis: string): Promise<void> => {
    const n = usage.get(axis) ?? 0
    const ok = await api.confirm({
      message: `分類軸「${axis}」を削除しますか？`,
      detail: n > 0 ? `${n} 件のファイルに設定されている ${axis} のパスも削除されます。この操作は元に戻せません。` : undefined,
      okLabel: '削除',
      danger: true
    })
    if (!ok) return
    updateMeta((m) => removeAxis(m, axis))
    if (activeAxis === axis) setActiveAxis(meta.axes.find((a) => a !== axis) ?? FS_AXIS)
  }

  return (
    <section>
      <SectionTitle hint="左ペインのタブに表示される分類軸です。名前の変更は全ファイルに反映されます。">
        分類軸
      </SectionTitle>
      <ul className="mb-2 divide-y divide-line rounded-lg border border-line">
        {meta.axes.map((axis, i) => (
          <li key={axis} className="flex h-9 items-center gap-1 px-2">
            {renaming?.from === axis ? (
              <input
                autoFocus
                value={renaming.to}
                onChange={(e) => setRenaming({ from: axis, to: e.target.value })}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return
                  if (e.key === 'Enter') submitRename()
                  if (e.key === 'Escape') {
                    e.stopPropagation()
                    setRenaming(null)
                  }
                }}
                onBlur={submitRename}
                className="h-7 min-w-0 flex-1 rounded-md border border-accent bg-panel px-2 text-[12px] outline-none"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate text-[12px]">
                {axis}
                {meta.settings.dateAxis === axis && (
                  <span className="ml-2 rounded bg-sunken px-1.5 py-0.5 text-[10px] text-muted">日付軸</span>
                )}
              </span>
            )}
            <span className="w-14 text-right text-[11px] text-faint tabular-nums">{usage.get(axis) ?? 0} 件</span>
            {renaming?.from === axis ? (
              <IconButton label="確定" onMouseDown={(e) => e.preventDefault()} onClick={submitRename}>
                <CheckIcon className="size-3.5" />
              </IconButton>
            ) : (
              <IconButton label="名前を変更" onClick={() => setRenaming({ from: axis, to: axis })}>
                <Pencil className="size-3.5" />
              </IconButton>
            )}
            <IconButton label="上へ" disabled={i === 0} onClick={() => updateMeta((m) => moveAxis(m, axis, -1))}>
              <ArrowUp className="size-3.5" />
            </IconButton>
            <IconButton
              label="下へ"
              disabled={i === meta.axes.length - 1}
              onClick={() => updateMeta((m) => moveAxis(m, axis, 1))}
            >
              <ArrowDown className="size-3.5" />
            </IconButton>
            <IconButton label="削除" onClick={() => void remove(axis)} className="hover:!text-danger">
              <Trash className="size-3.5" />
            </IconButton>
          </li>
        ))}
        {meta.axes.length === 0 && <li className="px-3 py-2 text-[12px] text-faint">分類軸がありません</li>}
      </ul>
      <form
        className="flex items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!trimmed || addError) return
          updateMeta((m) => addAxis(m, trimmed))
          setNewAxis('')
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <input
            value={newAxis}
            onChange={(e) => setNewAxis(e.target.value)}
            placeholder="新しい軸の名前（例: Status, Author）"
            className="h-7 rounded-md border border-line bg-panel px-2 text-[12px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          {addError && <span className="text-[11px] text-danger">{addError}</span>}
        </div>
        <Button type="submit" disabled={!trimmed || !!addError}>
          <Plus className="size-3.5" />
          追加
        </Button>
      </form>
    </section>
  )
}

function DateSection() {
  const meta = useApp((s) => s.meta)
  const files = useApp((s) => s.files)
  const updateMeta = useApp((s) => s.updateMeta)
  const toast = useApp((s) => s.toast)
  const { settings } = meta
  const set = (patch: Partial<typeof settings>): void =>
    updateMeta((m) => ({ ...m, settings: { ...m.settings, ...patch } }))

  const missing = useMemo(
    () => files.filter((f) => getPaths(meta, f.relPath, settings.dateAxis).length === 0),
    [files, meta, settings.dateAxis]
  )

  return (
    <section>
      <SectionTitle hint="ファイルの作成日・更新日から YYYY/MM/DD のパスを付与します。">Date 軸の自動付与</SectionTitle>
      <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
        <label className="flex items-center gap-2 text-[12px]">
          <span className="w-24 text-muted">付与先の軸</span>
          <select
            value={meta.axes.includes(settings.dateAxis) ? settings.dateAxis : ''}
            onChange={(e) => set({ dateAxis: e.target.value })}
            className="h-7 rounded-md border border-line bg-panel px-2 text-[12px]"
          >
            {!meta.axes.includes(settings.dateAxis) && <option value="">（{settings.dateAxis}・未作成）</option>}
            {meta.axes.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="w-24 text-muted">基準の日時</span>
          {(
            [
              ['birthtime', '作成日'],
              ['mtime', '更新日']
            ] as [DateSource, string][]
          ).map(([v, label]) => (
            <label key={v} className="inline-flex items-center gap-1">
              <input
                type="radio"
                name="dateSource"
                checked={settings.dateSource === v}
                onChange={() => set({ dateSource: v })}
                className="accent-[var(--c-accent)]"
              />
              {label}
            </label>
          ))}
        </div>
        <Check checked={settings.autoDateOnCreate} onChange={(v) => set({ autoDateOnCreate: v })}>
          新規ファイル作成時に自動付与する
        </Check>
        <Check checked={settings.autoDateOnScan} onChange={(v) => set({ autoDateOnScan: v })}>
          スキャン時に、日付が未設定のファイルへ自動付与する
          <span className="block text-[11px] text-faint">外部で追加されたファイルにも自動で付きます</span>
        </Check>
        <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
          <span className="text-[12px] text-muted">
            {settings.dateAxis} 未設定のファイル: <strong className="text-fg tabular-nums">{missing.length}</strong> 件
          </span>
          <Button
            disabled={missing.length === 0}
            onClick={() => {
              updateMeta((m) => withAutoDates(m, missing))
              toast(`${missing.length} 件のファイルに日付を付与しました`)
            }}
          >
            今すぐ一括付与
          </Button>
        </div>
      </div>
    </section>
  )
}

function MaintenanceSection() {
  const meta = useApp((s) => s.meta)
  const fileMap = useApp((s) => s.fileMap)
  const workspace = useApp((s) => s.workspace)
  const updateMeta = useApp((s) => s.updateMeta)
  const orphans = useMemo(() => findOrphans(meta, new Set(fileMap.keys())), [meta, fileMap])
  const [show, setShow] = useState(false)

  return (
    <section>
      <SectionTitle hint="ファイルを外部で移動・削除すると、元のパスの分類情報が残ります。">メンテナンス</SectionTitle>
      <div className="rounded-lg border border-line p-3 text-[12px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted">
            存在しないファイルの分類情報: <strong className="text-fg tabular-nums">{orphans.length}</strong> 件
            {orphans.length > 0 && (
              <button className="ml-2 text-accent hover:underline" onClick={() => setShow((v) => !v)}>
                {show ? '隠す' : '表示'}
              </button>
            )}
          </span>
          <Button
            variant="danger"
            disabled={orphans.length === 0}
            onClick={async () => {
              const ok = await api.confirm({
                message: `${orphans.length} 件の不要な分類情報を削除しますか？`,
                okLabel: '削除',
                danger: true
              })
              if (ok) updateMeta((m) => removeFiles(m, orphans))
            }}
          >
            <X className="size-3.5" />
            整理する
          </Button>
        </div>
        {show && orphans.length > 0 && (
          <ul className="mt-2 max-h-32 overflow-y-auto rounded bg-sunken p-2 font-mono text-[11px] text-muted">
            {orphans.map((o) => (
              <li key={o} className="truncate">
                {o}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 border-t border-line pt-3 text-[11px] break-all text-faint">
          メタデータ: {workspace?.root}/.axistree.json
        </p>
      </div>
    </section>
  )
}
