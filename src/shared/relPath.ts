/** Helpers for workspace-relative, "/"-separated paths. Pure: usable from main and renderer. */

export function dirnameRel(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i < 0 ? '' : rel.slice(0, i)
}

export function basenameRel(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i < 0 ? rel : rel.slice(i + 1)
}

export function joinRel(...parts: string[]): string {
  return parts.filter((p) => p.length > 0).join('/')
}

/**
 * Resolve `href` (as written in a Markdown file living in `baseDir`) to a workspace-relative path.
 * Returns null for absolute URLs or when the result would escape the workspace.
 */
export function resolveRelative(baseDir: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return null
  let target = href.split('#')[0].split('?')[0]
  if (!target) return null
  try {
    target = decodeURI(target)
  } catch {
    // keep the raw value when it is not valid percent-encoding
  }
  const stack = target.startsWith('/') ? [] : baseDir.split('/').filter(Boolean)
  for (const seg of target.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (stack.length === 0) return null
      stack.pop()
    } else {
      stack.push(seg)
    }
  }
  return stack.length > 0 ? stack.join('/') : null
}

/** Files and folders whose name starts with "." and node_modules are never shown. */
export function isIgnoredName(name: string): boolean {
  return name.startsWith('.') || name === 'node_modules'
}

/** Validate a user-supplied relative path for a new file. Returns an error message or null. */
export function validateNewFilePath(rel: string): string | null {
  if (!rel.trim()) return 'ファイル名を入力してください'
  if (rel.includes('\\')) return '"\\" は使用できません'
  const segs = rel.split('/')
  for (const seg of segs) {
    if (!seg.trim()) return 'パスに空の要素があります'
    if (seg === '.' || seg === '..') return '"." や ".." は使用できません'
    if (isIgnoredName(seg)) return '"." で始まる名前や node_modules は使用できません'
    if (/[<>:"|?*\u0000-\u001f]/.test(seg)) return 'ファイル名に使用できない文字が含まれています'
  }
  return null
}
