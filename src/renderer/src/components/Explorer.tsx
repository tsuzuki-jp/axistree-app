import { memo, useDeferredValue, useEffect, useMemo, useRef } from 'react'
import {
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Folder,
  FolderOpen,
  HardDrive,
  Inbox,
  Search,
  Settings,
  Tags,
  X
} from 'lucide-react'
import {
  FS_AXIS,
  UNCATEGORIZED_KEY,
  allFolderKeys,
  buildAxisTree,
  buildFsTree,
  filterTree,
  type TreeFolder
} from '@shared/tree'
import { addAxis, axisUsage } from '@shared/meta'
import type { FileEntry } from '@shared/types'
import { expandKey, useApp, withAutoDates } from '../store'
import { FileIcon } from './FileIcon'
import { Dropdown, MenuAction, SearchMenu, type MenuItem } from './SearchMenu'
import { IconButton } from './ui'

export const Explorer = memo(function Explorer() {
  const files = useApp((s) => s.files)
  const dirs = useApp((s) => s.dirs)
  const meta = useApp((s) => s.meta)
  const workspace = useApp((s) => s.workspace)
  const activeAxis = useApp((s) => s.activeAxis)
  const filter = useApp((s) => s.filter)
  const setFilter = useApp((s) => s.setFilter)
  const setExpanded = useApp((s) => s.setExpanded)
  const collapseAll = useApp((s) => s.collapseAll)
  // Keep typing in the filter box responsive on large trees.
  const deferredFilter = useDeferredValue(filter)
  const rootName = workspace?.name ?? ''

  const fullTree = useMemo(
    () => (activeAxis === FS_AXIS ? buildFsTree(files, dirs, rootName) : buildAxisTree(files, meta, activeAxis)),
    [files, dirs, meta, activeAxis, rootName]
  )
  const tree = useMemo(() => filterTree(fullTree, deferredFilter), [fullTree, deferredFilter])

  const filtering = deferredFilter.trim().length > 0

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <AxisSwitcher />
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <label className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md bg-sunken px-2 text-muted focus-within:outline-2 focus-within:outline-accent">
          <Search className="size-3.5 shrink-0" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setFilter('')}
            placeholder="ファイル名で絞り込み"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-fg outline-none placeholder:text-faint"
          />
          {filtering && (
            <button aria-label="絞り込みを解除" onClick={() => setFilter('')} className="hover:text-fg">
              <X className="size-3.5" />
            </button>
          )}
        </label>
        <IconButton label="すべて展開" onClick={() => setExpanded(activeAxis, allFolderKeys(tree), true)}>
          <ChevronsUpDown className="size-3.5" />
        </IconButton>
        <IconButton label="すべて折りたたむ" onClick={() => collapseAll(activeAxis)}>
          <ChevronsDownUp className="size-3.5" />
        </IconButton>
      </div>
      <TreeView tree={tree} axis={activeAxis} forceExpand={filtering} />
    </div>
  )
})

function AxisSwitcher() {
  const meta = useApp((s) => s.meta)
  const activeAxis = useApp((s) => s.activeAxis)
  const setActiveAxis = useApp((s) => s.setActiveAxis)
  const updateMeta = useApp((s) => s.updateMeta)
  const openDialog = useApp((s) => s.openDialog)
  const usage = useMemo(() => axisUsage(meta), [meta])

  const isFs = activeAxis === FS_AXIS
  const axisIcon = (axis: string, cls = 'size-3.5'): React.ReactNode =>
    axis === FS_AXIS ? (
      <HardDrive className={cls} />
    ) : axis === meta.settings.dateAxis ? (
      <CalendarDays className={cls} />
    ) : (
      <Tags className={cls} />
    )

  const items: MenuItem[] = [
    ...meta.axes.map((axis) => ({
      id: axis,
      label: axis,
      icon: axisIcon(axis),
      detail: usage.get(axis) ?? 0,
      checked: axis === activeAxis,
      group: 'axes',
      onSelect: () => setActiveAxis(axis)
    })),
    {
      id: FS_AXIS,
      label: '物理フォルダ',
      icon: axisIcon(FS_AXIS),
      checked: isFs,
      group: 'fs',
      onSelect: () => setActiveAxis(FS_AXIS)
    }
  ]

  return (
    <div className="flex items-center gap-1 border-b border-line px-2 py-2">
      <div className="min-w-0 flex-1">
        <Dropdown
          trigger={({ open, toggle }) => (
            <button
              onClick={toggle}
              aria-haspopup="listbox"
              aria-expanded={open}
              title="表示する分類軸を切り替え"
              className={`flex h-8 w-full items-center gap-2 rounded-md border px-2 text-left transition-colors ${
                open ? 'border-accent ring-2 ring-accent/20' : 'border-line hover:bg-hover'
              }`}
            >
              <span className="text-accent">{axisIcon(activeAxis, 'size-4')}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                {isFs ? '物理フォルダ' : activeAxis}
              </span>
              <span className="shrink-0 text-[11px] text-faint">
                {isFs ? '' : `${meta.axes.indexOf(activeAxis) + 1} / ${meta.axes.length} 軸`}
              </span>
              <ChevronDown className={`size-3.5 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        >
          {(close) => (
            <SearchMenu
              items={items}
              placeholder="分類軸を検索・新規作成"
              onClose={close}
              onCreate={(name) => {
                updateMeta((m) => addAxis(m, name))
                setActiveAxis(name)
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
    </div>
  )
}

function TreeView({ tree, axis, forceExpand }: { tree: TreeFolder; axis: string; forceExpand: boolean }) {
  const selectedFile = useApp((s) => s.selectedFile)
  const revealTick = useApp((s) => s.revealTick)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current.querySelector('[data-selected="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [revealTick, axis])

  const empty = tree.folders.length === 0 && tree.files.length === 0
  return (
    <div ref={ref} role="tree" aria-label="ファイルツリー" className="min-h-0 flex-1 overflow-auto py-1 select-none">
      {empty ? (
        <p className="px-4 py-6 text-center text-[12px] text-faint">
          {forceExpand ? '一致するファイルはありません' : 'ファイルがありません'}
        </p>
      ) : (
        <FolderChildren
          node={tree}
          axis={axis}
          depth={0}
          forceExpand={forceExpand}
          selectedFile={selectedFile}
        />
      )}
    </div>
  )
}

interface ChildProps {
  node: TreeFolder
  axis: string
  depth: number
  forceExpand: boolean
  selectedFile: string | null
}

const FolderChildren = memo(function FolderChildren({ node, axis, depth, forceExpand, selectedFile }: ChildProps) {
  return (
    <>
      {node.folders.map((f) => (
        <FolderRow
          key={f.key}
          node={f}
          axis={axis}
          depth={depth}
          forceExpand={forceExpand}
          selectedFile={selectedFile}
        />
      ))}
      {node.files.map((f) => (
        <FileRow key={f.relPath} file={f} depth={depth} selected={f.relPath === selectedFile} />
      ))}
    </>
  )
})

const indent = (depth: number): React.CSSProperties => ({ paddingLeft: 8 + depth * 14 })

function FolderRow({ node, axis, depth, forceExpand, selectedFile }: ChildProps) {
  const isOpen = useApp((s) => s.expanded.has(expandKey(axis, node.key)))
  const isSelected = useApp((s) => s.selectedFolder?.axis === axis && s.selectedFolder.key === node.key)
  const toggleFolder = useApp((s) => s.toggleFolder)
  const selectFolder = useApp((s) => s.selectFolder)
  const open = forceExpand || isOpen
  const FolderGlyph = node.uncategorized ? Inbox : open ? FolderOpen : Folder

  return (
    <div role="treeitem" aria-expanded={open}>
      <div
        className={`tree-row group flex h-[26px] items-center gap-1 pr-2 ${
          isSelected ? 'bg-hover' : 'hover:bg-hover/70'
        }`}
        style={indent(depth)}
        onClick={() => {
          toggleFolder(axis, node.key)
          selectFolder({ axis, key: node.key, path: node.path, uncategorized: !!node.uncategorized })
        }}
      >
        <ChevronRight
          className={`size-3.5 shrink-0 text-faint transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <FolderGlyph
          className={`size-4 shrink-0 ${node.uncategorized ? 'text-faint' : 'text-amber-500 dark:text-amber-400'}`}
          strokeWidth={1.75}
        />
        <span className={`min-w-0 flex-1 truncate ${node.uncategorized ? 'text-muted italic' : ''}`}>
          {node.name}
        </span>
        {node.key === UNCATEGORIZED_KEY && <UncategorizedDateAction axis={axis} files={node.files} />}
        <span className="shrink-0 rounded px-1 text-[11px] text-faint tabular-nums">{node.count}</span>
      </div>
      {open && (
        <div role="group">
          <FolderChildren
            node={node}
            axis={axis}
            depth={depth + 1}
            forceExpand={forceExpand}
            selectedFile={selectedFile}
          />
        </div>
      )}
    </div>
  )
}

/** On the date axis, offer to date every uncategorized file in one click. */
function UncategorizedDateAction({ axis, files }: { axis: string; files: FileEntry[] }) {
  const dateAxis = useApp((s) => s.meta.settings.dateAxis)
  const dateSource = useApp((s) => s.meta.settings.dateSource)
  const updateMeta = useApp((s) => s.updateMeta)
  const toast = useApp((s) => s.toast)
  if (axis !== dateAxis || files.length === 0) return null
  const label = `${files.length} 件に${dateSource === 'birthtime' ? '作成日' : '更新日'}を一括付与`
  return (
    <button
      title={label}
      aria-label={label}
      className="hidden size-5 items-center justify-center rounded text-muted group-hover:inline-flex hover:bg-panel hover:text-accent"
      onClick={(e) => {
        e.stopPropagation()
        updateMeta((m) => withAutoDates(m, files))
        toast(`${files.length} 件のファイルに日付を付与しました`)
      }}
    >
      <CalendarPlus className="size-3.5" />
    </button>
  )
}

const FileRow = memo(function FileRow({
  file,
  depth,
  selected
}: {
  file: FileEntry
  depth: number
  selected: boolean
}) {
  const selectFile = useApp((s) => s.selectFile)
  return (
    <div
      role="treeitem"
      aria-selected={selected}
      data-selected={selected}
      title={file.relPath}
      onClick={() => selectFile(file.relPath)}
      className={`tree-row flex h-[26px] items-center gap-1.5 pr-2 ${
        selected ? 'bg-accent-soft text-fg font-medium' : 'hover:bg-hover/70'
      }`}
      style={{ paddingLeft: 8 + depth * 14 + 18 }}
    >
      <FileIcon ext={file.ext} />
      <span className="min-w-0 flex-1 truncate">{file.name}</span>
    </div>
  )
})
