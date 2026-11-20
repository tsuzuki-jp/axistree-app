import { FolderOpen, Layers } from 'lucide-react'
import { Button } from './ui'

export function WelcomeScreen({
  recent,
  busy,
  onSelect,
  onOpenRecent
}: {
  recent: string[]
  busy: boolean
  onSelect: () => void
  onOpenRecent: (root: string) => void
}) {
  return (
    <div className="flex h-full items-center justify-center bg-app p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-fg shadow-sm">
            <Layers className="size-6" />
          </div>
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight">AxisTree</h1>
            <p className="text-[12px] text-muted">ひとつのファイルを、いくつもの分類軸で整理する</p>
          </div>
        </div>
        <p className="mb-5 text-[13px] leading-relaxed text-muted">
          フォルダをワークスペースとして開くと、ファイルに Date・Project・Content などの階層パスを付けて、
          軸を切り替えながら閲覧できます。分類情報はフォルダ直下の <code className="font-mono">.axistree.json</code>{' '}
          に保存され、ファイル本体は移動しません。
        </p>
        <Button variant="primary" onClick={onSelect} disabled={busy} className="h-9 px-4 text-[13px]">
          <FolderOpen className="size-4" />
          フォルダを開く
        </Button>
        {recent.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">最近使ったフォルダ</h2>
            <ul className="overflow-hidden rounded-lg border border-line bg-panel">
              {recent.map((r) => (
                <li key={r} className="border-b border-line last:border-b-0">
                  <button
                    disabled={busy}
                    onClick={() => onOpenRecent(r)}
                    className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-hover disabled:opacity-50"
                  >
                    <span className="text-[13px] font-medium">{r.split(/[\\/]/).filter(Boolean).pop() ?? r}</span>
                    <span className="w-full truncate font-mono text-[11px] text-faint">{r}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
