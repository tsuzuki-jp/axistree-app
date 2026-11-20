import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 border-transparent',
  secondary: 'bg-panel text-fg border-line hover:bg-hover',
  ghost: 'bg-transparent text-muted border-transparent hover:bg-hover hover:text-fg',
  danger: 'bg-transparent text-danger border-line hover:bg-hover'
}

export function Button({
  variant = 'secondary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 disabled:pointer-events-none ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function IconButton({
  label,
  className = '',
  children,
  active = false,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 disabled:pointer-events-none ${
        active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-fg'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-sunken px-1 font-mono text-[10px] text-muted">{children}</kbd>
  )
}
