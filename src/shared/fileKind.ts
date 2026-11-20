export type FileKind = 'markdown' | 'image' | 'pdf' | 'other'

const MARKDOWN = new Set(['md', 'markdown'])
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])

export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

export function fileKind(ext: string): FileKind {
  if (MARKDOWN.has(ext)) return 'markdown'
  if (IMAGE.has(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  return 'other'
}
