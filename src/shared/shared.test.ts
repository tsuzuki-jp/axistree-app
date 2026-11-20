import { describe, expect, it } from 'vitest'
import { dateToAxisPath, parseAxisPath } from './axisPath'
import {
  addPath,
  axisUsage,
  createDefaultMeta,
  findOrphans,
  normalizeMeta,
  removeAxis,
  removePathAt,
  renameAxis
} from './meta'
import { resolveRelative, validateNewFilePath } from './relPath'
import {
  UNCATEGORIZED_KEY,
  buildAxisTree,
  buildFsTree,
  collectPrefixes,
  filterTree,
  suggestPaths
} from './tree'
import type { FileEntry } from './types'

const file = (relPath: string): FileEntry => ({
  relPath,
  name: relPath.split('/').pop()!,
  ext: 'md',
  size: 1,
  mtimeMs: 0,
  birthtimeMs: 0
})

describe('axis paths', () => {
  it('parses slash-separated input, trimming blanks', () => {
    expect(parseAxisPath(' Project_A / chapter_1/ ')).toEqual(['Project_A', 'chapter_1'])
    expect(parseAxisPath('///')).toEqual([])
  })

  it('formats local dates as zero-padded YYYY/MM/DD', () => {
    expect(dateToAxisPath(new Date(2026, 10, 5, 12).getTime())).toEqual(['2026', '11', '05'])
  })
})

describe('normalizeMeta', () => {
  it('falls back to defaults for garbage', () => {
    expect(normalizeMeta(null)).toEqual(createDefaultMeta())
    expect(normalizeMeta({ axes: 'x', files: [] })).toEqual(createDefaultMeta())
  })

  it('accepts hand-written single paths and slash strings', () => {
    const meta = normalizeMeta({
      axes: ['Date', 'Project'],
      files: {
        'note_1.md': {
          Date: ['2026', '11', '20'],
          Project: [['Project_A', 'chapter_1'], 'Project_B/x', ['Project_A', 'chapter_1']],
          Content: 'Study/CFD'
        },
        'empty.md': { Date: [] }
      }
    })
    expect(meta.files['note_1.md']).toEqual({
      Date: [['2026', '11', '20']],
      Project: [
        ['Project_A', 'chapter_1'],
        ['Project_B', 'x']
      ],
      Content: [['Study', 'CFD']]
    })
    expect(meta.files['empty.md']).toBeUndefined()
    // axes referenced only from file data are added
    expect(meta.axes).toEqual(['Date', 'Project', 'Content'])
  })
})

describe('meta updates', () => {
  it('adds, dedupes and removes paths, dropping empty entries', () => {
    let meta = createDefaultMeta()
    meta = addPath(meta, 'a.md', 'Project', ['P'])
    meta = addPath(meta, 'a.md', 'Project', ['P'])
    expect(meta.files['a.md'].Project).toEqual([['P']])
    meta = removePathAt(meta, 'a.md', 'Project', 0)
    expect(meta.files['a.md']).toBeUndefined()
  })

  it('renames and removes axes across files', () => {
    let meta = addPath(createDefaultMeta(), 'a.md', 'Date', ['2026'])
    meta = renameAxis(meta, 'Date', 'When')
    expect(meta.axes[0]).toBe('When')
    expect(meta.settings.dateAxis).toBe('When')
    expect(meta.files['a.md']).toEqual({ When: [['2026']] })
    meta = removeAxis(meta, 'When')
    expect(meta.files['a.md']).toBeUndefined()
    expect(meta.axes).not.toContain('When')
  })

  it('counts files per axis, including unused axes', () => {
    let meta = addPath(createDefaultMeta(), 'a.md', 'Project', ['P'])
    meta = addPath(meta, 'a.md', 'Project', ['Q'])
    meta = addPath(meta, 'b.md', 'Project', ['P'])
    expect(axisUsage(meta)).toEqual(
      new Map([
        ['Date', 0],
        ['Project', 2],
        ['Content', 0]
      ])
    )
  })

  it('finds metadata for files that no longer exist', () => {
    const meta = addPath(createDefaultMeta(), 'gone.md', 'Project', ['P'])
    expect(findOrphans(meta, new Set(['other.md']))).toEqual(['gone.md'])
  })
})

describe('trees', () => {
  const files = [file('note_1.md'), file('docs/note_2.md'), file('docs/img/x.md')]
  let meta = createDefaultMeta()
  meta = addPath(meta, 'note_1.md', 'Project', ['Project_A', 'chapter_1'])
  meta = addPath(meta, 'note_1.md', 'Project', ['Project_B'])
  meta = addPath(meta, 'docs/note_2.md', 'Project', ['Project_A'])

  it('builds an axis tree with multi-path files and an uncategorized bucket', () => {
    const tree = buildAxisTree(files, meta, 'Project')
    expect(tree.folders.map((f) => f.name)).toEqual(['Project_A', 'Project_B', '(未分類)'])
    const a = tree.folders[0]
    expect(a.count).toBe(2)
    expect(a.files.map((f) => f.relPath)).toEqual(['docs/note_2.md'])
    expect(a.folders[0].files.map((f) => f.relPath)).toEqual(['note_1.md'])
    const unc = tree.folders[2]
    expect(unc.key).toBe(UNCATEGORIZED_KEY)
    expect(unc.files.map((f) => f.relPath)).toEqual(['docs/img/x.md'])
    expect(tree.count).toBe(3)
  })

  it('builds the physical tree including empty directories', () => {
    const tree = buildFsTree(files, ['docs', 'docs/img', 'empty'], 'root')
    expect(tree.folders.map((f) => f.name)).toEqual(['docs', 'empty'])
    expect(tree.files.map((f) => f.name)).toEqual(['note_1.md'])
    expect(tree.folders[0].count).toBe(2)
    expect(tree.folders[1].count).toBe(0)
  })

  it('filters by file name keeping ancestors', () => {
    const tree = filterTree(buildAxisTree(files, meta, 'Project'), 'note_2')!
    expect(tree.folders.map((f) => f.name)).toEqual(['Project_A'])
    expect(tree.count).toBe(1)
  })

  it('sorts numerically', () => {
    let m = createDefaultMeta()
    for (const d of ['10', '2', '1']) m = addPath(m, `${d}.md`, 'Date', [d])
    const tree = buildAxisTree([file('10.md'), file('2.md'), file('1.md')], m, 'Date')
    expect(tree.folders.map((f) => f.name)).toEqual(['1', '2', '10'])
  })
})

describe('suggestions', () => {
  let meta = createDefaultMeta()
  meta = addPath(meta, 'a.md', 'Project', ['Project_A', 'chapter_1'])
  meta = addPath(meta, 'b.md', 'Project', ['Project_A', 'chapter_2'])
  meta = addPath(meta, 'c.md', 'Project', ['Other', 'proj_notes'])
  const prefixes = collectPrefixes(meta, 'Project')

  it('collects every prefix with file counts', () => {
    expect(prefixes.get('Project_A')).toBe(2)
    expect(prefixes.get('Project_A/chapter_1')).toBe(1)
  })

  it('ranks prefix matches first, shallow first', () => {
    expect(suggestPaths(prefixes, 'proj')).toEqual([
      'Project_A',
      'Project_A/chapter_1',
      'Project_A/chapter_2',
      'Other/proj_notes'
    ])
    expect(suggestPaths(prefixes, 'Project_A/')).toEqual(['Project_A/chapter_1', 'Project_A/chapter_2'])
  })

  it('omits the exact input and excluded values', () => {
    expect(suggestPaths(prefixes, 'Project_A', new Set(['Project_A/chapter_1']))).toEqual([
      'Project_A/chapter_2'
    ])
  })
})

describe('relative paths', () => {
  it('resolves markdown links within the workspace', () => {
    expect(resolveRelative('docs', './img/a%20b.png')).toBe('docs/img/a b.png')
    expect(resolveRelative('docs', '../note.md#top')).toBe('note.md')
    expect(resolveRelative('docs', '/root.md')).toBe('root.md')
    expect(resolveRelative('', '../escape.md')).toBeNull()
    expect(resolveRelative('docs', 'https://example.com')).toBeNull()
  })

  it('validates new file paths', () => {
    expect(validateNewFilePath('notes/today.md')).toBeNull()
    expect(validateNewFilePath('../x.md')).not.toBeNull()
    expect(validateNewFilePath('.hidden.md')).not.toBeNull()
    expect(validateNewFilePath('a//b.md')).not.toBeNull()
  })
})
