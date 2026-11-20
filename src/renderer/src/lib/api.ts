import { FILE_PROTOCOL } from '@shared/ipc'
import type { FileEntry } from '@shared/types'

export const api = window.axistree

/** Strip Electron's "Error invoking remote method 'x': Error:" prefix. */
export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}

/** URL for <img>/<iframe>; the version query busts the cache when the file changes. */
export function fileUrl(relPath: string, file?: Pick<FileEntry, 'mtimeMs'>): string {
  const encoded = relPath.split('/').map(encodeURIComponent).join('/')
  return `${FILE_PROTOCOL}://ws/${encoded}${file ? `?v=${Math.round(file.mtimeMs)}` : ''}`
}
