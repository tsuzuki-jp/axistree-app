import { File, FileImage, FileText, FileType } from 'lucide-react'
import { fileKind } from '@shared/fileKind'

export function FileIcon({ ext, className = 'size-4' }: { ext: string; className?: string }) {
  switch (fileKind(ext)) {
    case 'markdown':
      return <FileText className={`${className} text-accent`} strokeWidth={1.75} />
    case 'image':
      return <FileImage className={`${className} text-emerald-600 dark:text-emerald-400`} strokeWidth={1.75} />
    case 'pdf':
      return <FileType className={`${className} text-rose-600 dark:text-rose-400`} strokeWidth={1.75} />
    default:
      return <File className={`${className} text-faint`} strokeWidth={1.75} />
  }
}
