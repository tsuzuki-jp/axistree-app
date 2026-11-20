import { useCallback } from 'react'

/** Vertical drag handle. `onDrag` receives the horizontal delta since the drag started. */
export function Splitter({ onDragStart, onDrag }: { onDragStart: () => void; onDrag: (dx: number) => void }) {
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const x0 = e.clientX
      onDragStart()
      const move = (ev: MouseEvent): void => onDrag(ev.clientX - x0)
      const up = (): void => {
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
        document.body.style.cursor = ''
      }
      document.body.style.cursor = 'col-resize'
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    },
    [onDrag, onDragStart]
  )
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      className="group relative z-10 -mx-[3px] w-[7px] shrink-0 cursor-col-resize"
    >
      <div className="mx-auto h-full w-px bg-line transition-colors group-hover:w-[3px] group-hover:bg-accent/50" />
    </div>
  )
}
