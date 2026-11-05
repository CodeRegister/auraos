import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import { safeResolve, fileKind } from '@/lib/os/server-fs'

const MAX_READ = 2 * 1024 * 1024 // 2 MB
const MAX_WRITE = 5 * 1024 * 1024 // 5 MB

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('path') || ''
  const file = safeResolve(q)
  if (!file) return NextResponse.json({ error: 'Path outside workspace' }, { status: 403 })

  try {
    const st = await fs.stat(file)
    if (st.isDirectory()) return NextResponse.json({ error: 'That is a folder' }, { status: 400 })
    const ext = file.split('.').pop()?.toLowerCase() ?? ''
    const kind = fileKind(ext)

    if (kind === 'image') {
      const buf = await fs.readFile(file)
      if (buf.length > MAX_READ)
        return NextResponse.json({ error: 'Image too large to preview (max 2 MB)' }, { status: 400 })
      const mime =
        ext === 'svg' ? 'image/svg+xml'
        : ext === 'jpg' ? 'image/jpeg'
        : ext === 'ico' ? 'image/x-icon'
        : `image/${ext}`
      return NextResponse.json({
        path: file,
        content: buf.toString('base64'),
        encoding: 'base64',
        binary: true,
        size: st.size,
        mime,
      })
    }

    if (kind === 'binary') {
      // sniff: look for NUL bytes in the first 8KB before giving up
      const fh = await fs.open(file, 'r')
      try {
        const { buffer, bytesRead } = await fh.read(Buffer.alloc(8192), 0, 8192, 0)
        if (buffer.subarray(0, bytesRead).includes(0))
          return NextResponse.json({ error: 'Binary file — cannot preview', binary: true }, { status: 415 })
      } finally {
        await fh.close()
      }
    }

    if (st.size > MAX_READ) return NextResponse.json({ error: 'File too large (max 2 MB)' }, { status: 400 })
    const content = await fs.readFile(file, 'utf8')
    return NextResponse.json({ path: file, content, encoding: 'utf8', binary: false, size: st.size })
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    const msg =
      err.code === 'ENOENT' ? 'File not found' : err.code === 'EACCES' ? 'Permission denied' : 'Failed to read file'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function PUT(req: NextRequest) {
  let body: { path?: string; content?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const file = safeResolve(body.path || '')
  if (!file) return NextResponse.json({ error: 'Path outside workspace' }, { status: 403 })
  if (typeof body.content !== 'string') return NextResponse.json({ error: 'Missing content' }, { status: 400 })
  if (body.content.length > MAX_WRITE) return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 400 })

  try {
    await fs.writeFile(file, body.content, 'utf8')
    return NextResponse.json({ ok: true })
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    const msg =
      err.code === 'ENOENT' ? 'File not found' : err.code === 'EACCES' ? 'Permission denied' : 'Failed to save file'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
