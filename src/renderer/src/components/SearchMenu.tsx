import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Check, Plus, Search } from 'lucide-react'

/** Anchored panel that owns its open state and closes on outside click. */
export function Dropdown({
  trigger,
  children,
  panelClassName = 'left-0 right-0'
}: {
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode
  children: (close: () => void) => ReactNode
  panelClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Inside a scrolling pane (the inspector) the panel may open below the fold: bring it into view.
  useEffect(() => {
    if (open) panelRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          ref={panelRef}
          className={`absolute top-full z-30 mt-1 overflow-hidden rounded-lg border border-line bg-panel shadow-xl ${panelClassName}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export interface MenuItem {
  id: string
  label: string
  icon?: ReactNode
  /** Right-aligned secondary text, e.g. a usage count. */
  detail?: ReactNode
  checked?: boolean
  /** Items with a different group than the previous one get a divider (and optional heading). */
  group?: string
  onSelect: () => void
}

/**
 * Filterable list for a dropdown: type to narrow, ↑/↓ to move, Enter to pick, Esc to close.
 * When `onCreate` is given and the query matches nothing exactly, a "create" row is offered.
 */
export function SearchMenu({
  items,
  placeholder,
  onClose,
  onCreate,
  createLabel = (q) => `「${q}」を作成`,
  canCreate = () => true,
  footer,
  emptyText = '該当なし'
}: {
  items: MenuItem[]
  placeholder: string
  onClose: () => void
  onCreate?: (name: string) => void
  createLabel?: (q: string) => string
  canCreate?: (q: string) => boolean
  footer?: ReactNode
  emptyText?: string
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()

  const q = query.trim()
  const lower = q.toLowerCase()
  const filtered = q ? items.filter((i) => i.label.toLowerCase().includes(lower)) : items
  const showCreate = !!onCreate && q.length > 0 && canCreate(q)
  const rows: MenuItem[] = showCreate
    ? [
        ...filtered,
        {
          id: '\u0000create',
          label: createLabel(q),
          icon: <Plus className="size-3.5 text-accent" />,
          group: '\u0000create',
          onSelect: () => onCreate!(q)
        }
      ]
    : filtered

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const pick = (item: MenuItem | undefined): void => {
    if (!item) return
    item.onSelect()
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (rows.length ? (i + 1) % rows.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(rows[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  return (
    <div className="flex max-h-[min(420px,70vh)] flex-col">
      <label className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-2.5 text-muted">
        <Search className="size-3.5 shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={rows[active] ? `${listId}-${active}` : undefined}
          className="min-w-0 flex-1 bg-transparent text-[12px] text-fg outline-none placeholder:text-faint"
        />
      </label>
      <ul ref={listRef} id={listId} role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
        {rows.length === 0 && <li className="px-3 py-2 text-[12px] text-faint">{emptyText}</li>}
        {rows.map((item, i) => {
          const divider = i > 0 && item.group !== rows[i - 1].group
          return (
            <li key={item.id} role="none">
              {divider && <div className="my-1 border-t border-line" />}
              <div
                id={`${listId}-${i}`}
                role="option"
                aria-selected={item.checked ?? false}
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(item)}
                className={`mx-1 flex h-7 items-center gap-2 rounded-md px-2 text-[12px] ${
                  i === active ? 'bg-hover' : ''
                }`}
              >
                <span className="flex size-4 shrink-0 items-center justify-center text-muted">{item.icon}</span>
                <span className={`min-w-0 flex-1 truncate ${item.checked ? 'font-semibold' : ''}`}>{item.label}</span>
                {item.detail !== undefined && (
                  <span className="shrink-0 text-[11px] text-faint tabular-nums">{item.detail}</span>
                )}
                <span className="flex size-3.5 shrink-0 items-center justify-center">
                  {item.checked && <Check className="size-3.5 text-accent" />}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      {footer && <div className="shrink-0 border-t border-line p-1">{footer}</div>}
    </div>
  )
}

/** Plain action row for a SearchMenu footer. */
export function MenuAction({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-muted hover:bg-hover hover:text-fg"
    >
      <span className="flex size-4 items-center justify-center">{icon}</span>
      {children}
    </button>
  )
}
