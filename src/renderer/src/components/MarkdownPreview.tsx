import { memo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { dirnameRel, resolveRelative } from '@shared/relPath'
import { api, errorMessage, fileUrl } from '../lib/api'
import { useApp } from '../store'

/** Renders Markdown safely (no raw HTML); local images and links resolve inside the workspace. */
export const MarkdownPreview = memo(function MarkdownPreview({
  source,
  relPath
}: {
  source: string
  relPath: string
}) {
  const baseDir = dirnameRel(relPath)

  const components: Components = {
    img: ({ src, alt, title }) => {
      const raw = typeof src === 'string' ? src : ''
      const local = resolveRelative(baseDir, raw)
      const url = local ? fileUrl(local) : /^(https?:|data:)/i.test(raw) ? raw : undefined
      return url ? <img src={url} alt={alt ?? ''} title={title} loading="lazy" /> : <span>{alt}</span>
    },
    a: ({ href, children, title }) => (
      <a
        href={href}
        title={title ?? href}
        onClick={(e) => {
          e.preventDefault()
          if (!href) return
          if (href.startsWith('#')) {
            const id = decodeURIComponent(href.slice(1))
            document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
            return
          }
          if (/^(https?:|mailto:)/i.test(href)) {
            api.openExternal(href).catch((err) => useApp.getState().toast(errorMessage(err), 'error'))
            return
          }
          const target = resolveRelative(baseDir, href)
          const { fileMap, selectFile, toast } = useApp.getState()
          if (target && fileMap.has(target)) selectFile(target, { reveal: true })
          else toast(`リンク先が見つかりません: ${href}`, 'error')
        }}
      >
        {children}
      </a>
    )
  }

  return (
    <article className="prose prose-sm prose-neutral dark:prose-invert max-w-none prose-headings:scroll-mt-4 prose-img:rounded-md prose-pre:bg-sunken prose-pre:text-fg prose-code:before:content-none prose-code:after:content-none">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </Markdown>
    </article>
  )
})
