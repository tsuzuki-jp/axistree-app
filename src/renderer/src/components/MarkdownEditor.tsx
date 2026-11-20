import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import type { FileEntry } from '@shared/types'
import { api, errorMessage } from '../lib/api'
import { registerFlusher } from '../lib/flush'
import { useApp } from '../store'
import { MarkdownPreview } from './MarkdownPreview'

export type EditorMode = 'edit' | 'split' | 'preview'
export type SaveState = 'loading' | 'saved' | 'dirty' | 'saving' | 'error'

const SAVE_DELAY = 600

/**
 * Markdown editing with debounced auto-save. Mount with `key={relPath}` so each file gets fresh state;
 * pending edits are flushed on unmount, before window close, and on Ctrl/Cmd+S.
 */
export function MarkdownEditor({
  file,
  mode,
  onSaveState,
  autoFocus
}: {
  file: FileEntry
  mode: EditorMode
  onSaveState: (s: SaveState) => void
  autoFocus: boolean
}) {
  const rel = file.relPath
  const [content, setContent] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const savedRef = useRef('') // what we believe is on disk
  const pendingRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const preview = useDeferredValue(content ?? '')

  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    const text = pendingRef.current
    if (text === null) return
    pendingRef.current = null
    onSaveState('saving')
    try {
      await api.writeText(rel, text)
      savedRef.current = text
      onSaveState(pendingRef.current === null ? 'saved' : 'dirty')
    } catch (err) {
      // Keep the text pending so the next edit (or flush) retries.
      pendingRef.current ??= text
      onSaveState('error')
      useApp.getState().toast(`保存に失敗しました: ${errorMessage(err)}`, 'error')
    }
  }, [rel, onSaveState])

  // Load file content.
  useEffect(() => {
    let cancelled = false
    onSaveState('loading')
    api
      .readText(rel)
      .then((text) => {
        if (cancelled) return
        savedRef.current = text
        setContent(text)
        onSaveState('saved')
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(errorMessage(err))
        onSaveState('error')
      })
    return () => {
      cancelled = true
    }
  }, [rel, onSaveState])

  // Flush on unmount / before close.
  useEffect(() => {
    const unregister = registerFlusher(flush)
    return () => {
      unregister()
      void flush()
    }
  }, [flush])

  // Reload when the file changes on disk and we have no unsaved edits.
  useEffect(
    () =>
      api.onWorkspaceChanged(async (change) => {
        if (!change.changed.includes(rel) || pendingRef.current !== null) return
        try {
          const text = await api.readText(rel)
          if (text !== savedRef.current && pendingRef.current === null) {
            savedRef.current = text
            setContent(text)
          }
        } catch {
          // deleted or unreadable: the file list update handles it
        }
      }),
    [rel]
  )

  // Focus once, right after the first load (used for freshly created files).
  const focusedRef = useRef(false)
  useEffect(() => {
    if (focusedRef.current || content === null) return
    focusedRef.current = true
    const el = textareaRef.current
    if (autoFocus && mode !== 'preview' && el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  })

  const onChange = (text: string): void => {
    setContent(text)
    pendingRef.current = text
    onSaveState('dirty')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void flush(), SAVE_DELAY)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void flush()
      return
    }
    if (e.key === 'Tab' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      const el = e.currentTarget
      const { selectionStart: s, selectionEnd: end, value } = el
      onChange(value.slice(0, s) + '  ' + value.slice(end))
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2))
    }
  }

  if (loadError) {
    return <p className="p-6 text-[12px] text-danger">読み込めませんでした: {loadError}</p>
  }
  if (content === null) return <div className="p-6 text-[12px] text-faint">読み込み中…</div>

  return (
    <div className="flex h-full min-h-0">
      {mode !== 'preview' && (
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          aria-label="Markdown エディタ"
          className={`h-full min-w-0 flex-1 resize-none bg-panel px-6 py-5 font-mono text-[13px] leading-relaxed text-fg outline-none ${
            mode === 'split' ? 'border-r border-line' : ''
          }`}
          placeholder="# タイトル&#10;&#10;ここに Markdown を書きます"
        />
      )}
      {mode !== 'edit' && (
        <div className="h-full min-w-0 flex-1 overflow-y-auto bg-panel px-8 py-6">
          {preview.trim() ? (
            <MarkdownPreview source={preview} relPath={rel} />
          ) : (
            <p className="text-[12px] text-faint">（空のドキュメント）</p>
          )}
        </div>
      )}
    </div>
  )
}
