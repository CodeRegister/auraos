import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { safeResolve, ROOT } from '@/lib/os/server-fs'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('path') || ROOT
  const dir = safeResolve(q)
  if (!dir) return NextResponse.json({ error: 'Path is outside the allowed workspace' }, { status: 403 })

  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true })
    const entries = await Promise.all(
      dirents.map(async (d) => {
        const full = path.join(dir, d.name)
        try {
          const st = await fs.stat(full) // follows symlinks
          return {
            name: d.name,
            type: st.isDirectory() ? ('directory' as const) : ('file' as const),
            size: st.size,
            mtime: st.mtimeMs,
            hidden: d.name.startsWith('.'),
            ext: path.extname(d.name).slice(1).toLowerCase(),
          }
        } catch {
          return null // broken symlink or unreadable entry
        }
      })
    )
    return NextResponse.json({ path: dir, entries: entries.filter(Boolean) })
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    const msg =
      err.code === 'ENOENT'
        ? 'Folder does not exist'
        : err.code === 'ENOTDIR'
          ? 'Not a folder'
          : err.code === 'EACCES'
            ? 'Permission denied'
            : 'Failed to read folder'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
