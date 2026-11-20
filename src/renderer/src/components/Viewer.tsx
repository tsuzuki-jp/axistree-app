import { useEffect, useState } from 'react'
import {
  Check,
  Columns2,
  Eye,
  ExternalLink,
  FilePlus,
  FolderOpen,
  LoaderCircle,
  Pencil,
  CircleExclamationPoint
} from 'lucide-react'
import { fileKind } from '@shared/fileKind'
import type { FileEntry } from '@shared/types'
import { api, errorMessage, fileUrl } from '../lib/api'
import { formatDateTime, formatSize } from '../lib/format'
import { loadPref, savePref } from '../lib/storage'
import { useApp } from '../store'
import { FileIcon } from './FileIcon'
import { MarkdownEditor, type EditorMode, type SaveState } from './MarkdownEditor'
import { Button, IconButton } from './ui'

/** Set by the new-file dialog so the freshly created file opens focused in edit mode. */
let focusNextEditor = false
export function requestEditorFocus(): void {
  focusNextEditor = true
}

export function Viewer() {
  const selected = useApp((s) => s.selectedFile)
  const file = useApp((s) => (s.selectedFile ? s.fileMap.get(s.selectedFile) : undefined))
  const openDialog = useApp((s) => s.openDialog)

  if (!selected || !file) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-panel text-center">
        <p className="text-[13px] text-muted">左のツリーからファイルを選択してください</p>
        <Button variant="primary" onClick={() => openDialog('newFile')}>
          <FilePlus className="size-3.5" />
          新規 Markdown
        </Button>
      </div>
    )
  }
  return <FileViewer key={file.relPath} file={file} />
}

function FileViewer({ file }: { file: FileEntry }) {
  const kind = fileKind(file.ext)
  const toast = useApp((s) => s.toast)
  const openDialog = useApp((s) => s.openDialog)
  const [mode, setMode] = useState<EditorMode>(() => loadPref<EditorMode>('editorMode', 'split'))
  const [saveState, setSaveState] = useState<SaveState>('loading')
  const [autoFocus] = useState(() => {
    const f = focusNextEditor
    focusNextEditor = false
    return f
  })

  useEffect(() => {
    if (autoFocus && mode === 'preview') setMode('split')
  }, [autoFocus, mode])

  const changeMode = (m: EditorMode): void => {
    setMode(m)
    savePref('editorMode', m)
  }
  const run = (p: Promise<unknown>): void => {
    p.catch((err) => toast(errorMessage(err), 'error'))
  }
  const crumbs = file.relPath.split('/')

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <FileIcon ext={file.ext} />
        <div className="flex min-w-0 flex-1 items-baseline gap-1 truncate text-[12px]" title={file.relPath}>
          {crumbs.slice(0, -1).map((c, i) => (
            <span key={i} className="shrink-0 text-faint">
              {c}
              <span className="px-0.5">/</span>
            </span>
          ))}
          <span className="truncate text-[13px] font-semibold">{file.name}</span>
        </div>

        {kind === 'markdown' && (
          <>
            <SaveIndicator state={saveState} />
            <div className="flex items-center rounded-md bg-sunken p-0.5" role="radiogroup" aria-label="表示モード">
              <IconButton label="編集" active={mode === 'edit'} onClick={() => changeMode('edit')} className="size-6">
                <Pencil className="size-3.5" />
              </IconButton>
              <IconButton label="分割" active={mode === 'split'} onClick={() => changeMode('split')} className="size-6">
                <Columns2 className="size-3.5" />
              </IconButton>
              <IconButton
                label="プレビュー"
                active={mode === 'preview'}
                onClick={() => changeMode('preview')}
                className="size-6"
              >
                <Eye className="size-3.5" />
              </IconButton>
            </div>
          </>
        )}
        <div className="mx-1 h-4 w-px bg-line" />
        <IconButton label="OSの既定アプリで開く" onClick={() => run(api.openPath(file.relPath))}>
          <ExternalLink className="size-3.5" />
        </IconButton>
        <IconButton label="フォルダで表示" onClick={() => run(api.showInFolder(file.relPath))}>
          <FolderOpen className="size-3.5" />
        </IconButton>
        <Button variant="primary" onClick={() => openDialog('newFile')} className="ml-1">
          <FilePlus className="size-3.5" />
          新規 Markdown
        </Button>
      </header>

      <div className="min-h-0 flex-1">
        {kind === 'markdown' && (
          <MarkdownEditor file={file} mode={mode} onSaveState={setSaveState} autoFocus={autoFocus} />
        )}
        {kind === 'image' && <ImagePreview file={file} />}
        {kind === 'pdf' && (
          <iframe title={file.name} src={fileUrl(file.relPath, file)} className="h-full w-full border-0" />
        )}
        {kind === 'other' && <OtherFile file={file} onOpen={() => run(api.openPath(file.relPath))} />}
      </div>
    </div>
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  const map: Record<SaveState, { text: string; icon: React.ReactNode; cls: string }> = {
    loading: { text: '読み込み中', icon: <LoaderCircle className="size-3 animate-spin" />, cls: 'text-faint' },
    saved: { text: '保存済み', icon: <Check className="size-3" />, cls: 'text-faint' },
    dirty: { text: '編集中', icon: <span className="size-1.5 rounded-full bg-amber-500" />, cls: 'text-muted' },
    saving: { text: '保存中', icon: <LoaderCircle className="size-3 animate-spin" />, cls: 'text-muted' },
    error: { text: '保存エラー', icon: <CircleExclamationPoint className="size-3" />, cls: 'text-danger' }
  }
  const s = map[state]
  return (
    <span className={`mr-1 inline-flex items-center gap-1 text-[11px] ${s.cls}`} aria-live="polite">
      {s.icon}
      {s.text}
    </span>
  )
}

function ImagePreview({ file }: { file: FileEntry }) {
  const [dims, setDims] = useState<string | null>(null)
  return (
    <div className="checkerboard relative flex h-full items-center justify-center overflow-auto p-6">
      <img
        src={fileUrl(file.relPath, file)}
        alt={file.name}
        onLoad={(e) => setDims(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`)}
        className="max-h-full max-w-full object-contain shadow-md"
      />
      {dims && (
        <span className="absolute right-3 bottom-3 rounded bg-panel/90 px-2 py-0.5 text-[11px] text-muted tabular-nums shadow">
          {dims} px · {formatSize(file.size)}
        </span>
      )}
    </div>
  )
}

function OtherFile({ file, onOpen }: { file: FileEntry; onOpen: () => void }) {
  const rows: [string, string][] = [
    ['種類', file.ext ? `.${file.ext} ファイル` : '拡張子なし'],
    ['サイズ', formatSize(file.size)],
    ['作成日時', formatDateTime(file.birthtimeMs)],
    ['更新日時', formatDateTime(file.mtimeMs)],
    ['パス', file.relPath]
  ]
  return (
    <div className="flex h-full items-center justify-center bg-app p-6">
      <div className="w-full max-w-md rounded-xl border border-line bg-panel p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-lg bg-sunken">
            <FileIcon ext={file.ext} className="size-6" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold">{file.name}</p>
            <p className="text-[12px] text-muted">このファイル形式はプレビューできません</p>
          </div>
        </div>
        <dl className="mb-5 grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1.5 text-[12px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="min-w-0 break-all">{v}</dd>
            </div>
          ))}
        </dl>
        <Button variant="primary" onClick={onOpen} className="w-full justify-center">
          <ExternalLink className="size-3.5" />
          OSの既定アプリで開く
        </Button>
      </div>
    </div>
  )
}
