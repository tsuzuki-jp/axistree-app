import { CircleExclamationPoint, Info, X } from 'lucide-react'
import { useApp } from '../store'

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className="pointer-events-auto flex items-start gap-2 rounded-lg border border-line bg-panel px-3 py-2.5 text-[12px] shadow-lg"
        >
          {t.kind === 'error' ? (
            <CircleExclamationPoint className="mt-px size-4 shrink-0 text-danger" />
          ) : (
            <Info className="mt-px size-4 shrink-0 text-accent" />
          )}
          <span className="min-w-0 flex-1 break-words">{t.message}</span>
          <button className="text-faint hover:text-fg" aria-label="閉じる" onClick={() => dismiss(t.id)}>
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
