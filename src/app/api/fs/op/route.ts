import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { safeResolve, ROOT } from '@/lib/os/server-fs'

export async function POST(req: NextRequest) {
  let body: {
    action: 'mkdir' | 'touch' | 'rename' | 'delete'
    path?: string
    name?: string
    newName?: string
    names?: string[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    if (body.action === 'mkdir' || body.action === 'touch') {
      const dir = safeResolve(body.path || ROOT)
      if (!dir) return NextResponse.json({ error: 'Path outside workspace' }, { status: 403 })
      const name = (body.name || '').trim()
      if (!name || name.includes('/')) return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
      const target = path.join(dir, name)
      if (body.action === 'mkdir') await fs.mkdir(target, { recursive: false })
      else await fs.writeFile(target, '', { flag: 'wx' })
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'rename') {
      const dir = safeResolve(body.path || ROOT)
      if (!dir) return NextResponse.json({ error: 'Path outside workspace' }, { status: 403 })
      const name = (body.name || '').trim()
      const newName = (body.newName || '').trim()
      if (!name || !newName || name.includes('/') || newName.includes('/') || newName === '.' || newName === '..')
        return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
      await fs.rename(path.join(dir, name), path.join(dir, newName))
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'delete') {
      const names = (body.names || []).slice(0, 100)
      if (!names.length) return NextResponse.json({ error: 'Nothing to delete' }, { status: 400 })
      const dir = safeResolve(body.path || ROOT)
      if (!dir) return NextResponse.json({ error: 'Path outside workspace' }, { status: 403 })
      if (dir === ROOT && names.includes('.'))
        return NextResponse.json({ error: 'Refusing to delete workspace root' }, { status: 403 })
      for (const n of names) {
        const name = (n || '').trim()
        if (!name || name.includes('/') || name === '.' || name === '..')
          return NextResponse.json({ error: `Invalid name: ${n}` }, { status: 400 })
        const target = path.join(dir, name)
        if (target === ROOT) return NextResponse.json({ error: 'Cannot delete workspace root' }, { status: 403 })
        await fs.rm(target, { recursive: true, force: false })
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    const msg =
      err.code === 'EEXIST'
        ? 'An item with that name already exists'
        : err.code === 'ENOENT'
          ? 'Item no longer exists'
          : err.code === 'EPERM' || err.code === 'EACCES'
            ? 'Permission denied'
            : err.code === 'ENOTEMPTY'
              ? 'Folder is not empty'
              : err.message || 'Operation failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
