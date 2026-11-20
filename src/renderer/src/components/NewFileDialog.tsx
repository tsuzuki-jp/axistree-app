import { useMemo, useState } from 'react'
import { formatAxisPath } from '@shared/axisPath'
import { addPath } from '@shared/meta'
import { joinRel, validateNewFilePath } from '@shared/relPath'
import { FS_AXIS, autoDatePath } from '@shared/tree'
import { api, errorMessage } from '../lib/api'
import { flushAll } from '../lib/flush'
import { loadPref, savePref } from '../lib/storage'
import { useApp } from '../store'
import { Modal } from './Modal'
import { Button } from './ui'
import { requestEditorFocus } from './Viewer'

const pad = (n: number): string => String(n).padStart(2, '0')

function defaultName(taken: (rel: string) => boolean, dir: string): string {
  const d = new Date()
  const base = `note_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  for (let i = 1; ; i++) {
    const name = i === 1 ? `${base}.md` : `${base}_${i}.md`
    if (!taken(joinRel(dir, name))) return name
  }
}

export function NewFileDialog() {
  const openDialog = useApp((s) => s.openDialog)
  const close = (): void => openDialog(null)
  const dirs = useApp((s) => s.dirs)
  const fileMap = useApp((s) => s.fileMap)
  const meta = useApp((s) => s.meta)
  const selectedFolder = useApp((s) => s.selectedFolder)
  const workspaceRoot = useApp((s) => s.workspace?.root ?? '')

  // Physical location: the folder selected in the physical tree, else the last folder used, else root.
  const lastDir = loadPref<string>(`newFileDir:${workspaceRoot}`, '')
  const initialDir =
    selectedFolder?.axis === FS_AXIS ? selectedFolder.path.join('/') : dirs.includes(lastDir) ? lastDir : ''
  const [dir, setDir] = useState(initialDir)
  const [name, setName] = useState(() => defaultName((r) => fileMap.has(r), initialDir))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Classification inherited from the folder selected in an axis tree.
  const inherit =
    selectedFolder && selectedFolder.axis !== FS_AXIS && !selectedFolder.uncategorized && selectedFolder.path.length > 0
      ? selectedFolder
      : null
  const [useInherit, setUseInherit] = useState(inherit !== null && inherit.axis !== meta.settings.dateAxis)
  const [useDate, setUseDate] = useState(meta.settings.autoDateOnCreate)

  const fileName = /\.[a-z0-9]+$/i.test(name.trim()) ? name.trim() : `${name.trim()}.md`
  const rel = joinRel(dir, fileName)
  const validation = name.trim() ? validateNewFilePath(rel) : 'ファイル名を入力してください'
  const exists = fileMap.has(rel)
  const sortedDirs = useMemo(() => [...dirs].sort((a, b) => a.localeCompare(b, 'ja', { numeric: true })), [dirs])

  const create = async (): Promise<void> => {
    if (validation || exists || busy) return
    setBusy(true)
    setError(null)
    try {
      await flushAll()
      const title = fileName.replace(/\.[^.]+$/, '')
      const entry = await api.createFile(rel, `# ${title}\n\n`)
      savePref(`newFileDir:${workspaceRoot}`, dir)
      const { addFile, updateMeta, selectFile, toast } = useApp.getState()
      addFile(entry)
      updateMeta((m) => {
        let next = m
        if (useInherit && inherit) next = addPath(next, rel, inherit.axis, inherit.path)
        if (useDate) next = addPath(next, rel, m.settings.dateAxis, autoDatePath(entry, m.settings.dateSource))
        return next
      })
      requestEditorFocus()
      selectFile(rel, { reveal: true })
      toast(`${rel} を作成しました`)
      close()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      title="新規 Markdown ファイル"
      onClose={close}
      footer={
        <>
          <Button onClick={close}>キャンセル</Button>
          <Button variant="primary" disabled={!!validation || exists || busy} onClick={() => void create()}>
            作成
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium">ファイル名</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => {
              const v = e.currentTarget.value
              const dot = v.lastIndexOf('.')
              e.currentTarget.setSelectionRange(0, dot > 0 ? dot : v.length)
            }}
            className="h-8 rounded-md border border-line bg-panel px-2 font-mono text-[12px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <span className={`text-[11px] ${validation || exists ? 'text-danger' : 'text-faint'}`}>
            {exists ? '同名のファイルが既に存在します' : (validation ?? `作成先: ${rel}`)}
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium">保存先フォルダ（実際の場所）</span>
          <select
            value={dir}
            onChange={(e) => setDir(e.target.value)}
            className="h-8 rounded-md border border-line bg-panel px-2 text-[12px] outline-none focus:border-accent"
          >
            <option value="">（ワークスペース直下）</option>
            {sortedDirs.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="flex flex-col gap-2 rounded-lg border border-line p-3">
          <legend className="px-1 text-[12px] font-medium">作成時に付与する分類</legend>
          {inherit && (
            <Check checked={useInherit} onChange={setUseInherit}>
              {inherit.axis}: <code className="font-mono">{formatAxisPath(inherit.path)}</code>
              <span className="text-faint">（ツリーで選択中のフォルダ）</span>
            </Check>
          )}
          <Check checked={useDate} onChange={setUseDate}>
            {meta.settings.dateAxis}: 作成日（YYYY/MM/DD）を自動付与
          </Check>
          {!inherit && (
            <p className="text-[11px] text-faint">
              ヒント: 分類軸のツリーでフォルダを選択してから作成すると、その分類を引き継げます。
            </p>
          )}
        </fieldset>
        {error && <p className="text-[12px] text-danger">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

export function Check({
  checked,
  onChange,
  children
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <label className="flex items-start gap-2 text-[12px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-[var(--c-accent)]"
      />
      <span className="min-w-0">{children}</span>
    </label>
  )
}
