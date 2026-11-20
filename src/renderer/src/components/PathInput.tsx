import { useId, useMemo, useRef, useState } from 'react'
import { CornerDownLeft } from 'lucide-react'
import { parseAxisPath } from '@shared/axisPath'
import { collectPrefixes, suggestPaths } from '@shared/tree'
import type { AxisPath } from '@shared/types'
import { useApp } from '../store'

/**
 * Text input for a "/"-separated axis path with suggestions from paths already used on that axis.
 * ↑/↓ choose, Tab completes (and appends "/" to keep drilling down), Enter commits, Esc cancels.
 */
export function PathInput({
  axis,
  initial = '',
  exclude,
  placeholder,
  autoFocus = false,
  onSubmit,
  onCancel
}: {
  axis: string
  initial?: string
  exclude: Set<string>
  placeholder?: string
  autoFocus?: boolean
  onSubmit: (path: AxisPath) => void
  onCancel?: () => void
}) {
  const meta = useApp((s) => s.meta)
  const prefixes = useMemo(() => collectPrefixes(meta, axis), [meta, axis])
  const [value, setValue] = useState(initial)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const suggestions = useMemo(
    () => (open ? suggestPaths(prefixes, value, exclude) : []),
    [open, prefixes, value, exclude]
  )

  const commit = (text: string): void => {
    const path = parseAxisPath(text)
    if (path.length === 0) return
    onSubmit(path)
    setValue('')
    setActive(-1)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.nativeEvent.isComposing) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setOpen(true)
        setActive((i) => Math.min(i + 1, suggestions.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => Math.max(i - 1, -1))
        break
      case 'Tab':
        if (suggestions.length > 0 && !e.shiftKey) {
          e.preventDefault()
          setValue(suggestions[Math.max(active, 0)] + '/')
          setActive(-1)
        }
        break
      case 'Enter':
        e.preventDefault()
        commit(active >= 0 && suggestions[active] ? suggestions[active] : value)
        break
      case 'Escape':
        if (open && suggestions.length > 0) {
          setOpen(false)
        } else {
          setValue('')
          onCancel?.()
        }
        e.stopPropagation()
        break
    }
  }

  const showList = open && suggestions.length > 0
  return (
    <div className="relative">
      <div className="flex h-7 items-center rounded-md border border-line bg-panel pr-1 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        <input
          ref={inputRef}
          value={value}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          placeholder={placeholder}
          onChange={(e) => {
            setValue(e.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false)
            // Leaving an untouched (or emptied) field closes it; typed text is kept otherwise.
            if (onCancel && (!value.trim() || value === initial)) onCancel()
          }}
          onKeyDown={onKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent px-2 font-mono text-[12px] outline-none placeholder:font-sans placeholder:text-faint"
        />
        {value.trim() && (
          <button
            tabIndex={-1}
            title="追加 (Enter)"
            aria-label="追加"
            onMouseDown={(e) => {
              e.preventDefault()
              commit(value)
            }}
            className="inline-flex size-5 items-center justify-center rounded text-muted hover:bg-hover hover:text-accent"
          >
            <CornerDownLeft className="size-3" />
          </button>
        )}
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-md border border-line bg-panel py-1 shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                commit(s)
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex items-center gap-2 px-2 py-1 font-mono text-[12px] ${
                i === active ? 'bg-accent-soft' : ''
              }`}
            >
              <span className="min-w-0 flex-1 truncate">
                {s.split('/').map((seg, j, all) => (
                  <span key={j}>
                    <span className={j === all.length - 1 ? 'text-fg' : 'text-muted'}>{seg}</span>
                    {j < all.length - 1 && <span className="px-0.5 text-faint">/</span>}
                  </span>
                ))}
              </span>
              <span className="shrink-0 font-sans text-[10px] text-faint tabular-nums">{prefixes.get(s)}</span>
            </li>
          ))}
          <li className="border-t border-line px-2 pt-1 text-[10px] text-faint" aria-hidden>
            Tab で補完 · Enter で追加
          </li>
        </ul>
      )}
    </div>
  )
}
