'use client'

export type FsEntry = {
  name: string
  type: 'file' | 'directory'
  size: number
  mtime: number
  hidden: boolean
  ext: string
}

export async function apiList(path: string): Promise<{ path: string; entries: FsEntry[] }> {
  const r = await fetch(`/api/fs/list?path=${encodeURIComponent(path)}`, { cache: 'no-store' })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error || `Failed to list ${path}`)
  }
  return r.json()
}

export type FsOp =
  | { action: 'mkdir'; path: string; name: string }
  | { action: 'touch'; path: string; name: string }
  | { action: 'rename'; path: string; name: string; newName: string }
  | { action: 'delete'; path: string; names: string[] }

export async function apiOp(op: FsOp): Promise<void> {
  const r = await fetch('/api/fs/op', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(op),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error || 'Operation failed')
  }
}

export async function apiReadFile(
  path: string
): Promise<{ path: string; content: string; encoding: 'utf8' | 'base64'; binary: boolean; size: number }> {
  const r = await fetch(`/api/fs/file?path=${encodeURIComponent(path)}`, { cache: 'no-store' })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error || `Failed to open ${path}`)
  }
  return r.json()
}

export async function apiWriteFile(path: string, content: string): Promise<void> {
  const r = await fetch('/api/fs/file', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error || 'Save failed')
  }
}

export async function apiTerminal(
  sessionId: string,
  cwd: string,
  cmd: string
): Promise<{ output: string; cwd: string; code: number; timedOut?: boolean }> {
  const r = await fetch('/api/terminal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, cwd, cmd }),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error || 'Terminal error')
  }
  return r.json()
}

export type SystemInfo = {
  hostname: string
  platform: string
  arch: string
  release: string
  cpuModel: string
  cores: number
  uptime: number
  cpuPercent: number
  memTotal: number
  memUsed: number
  load: number[]
  procCount: number
  topProcs: { pid: string; command: string; cpu: string; mem: string }[]
}

export async function apiSystem(): Promise<SystemInfo> {
  const r = await fetch('/api/system', { cache: 'no-store' })
  if (!r.ok) throw new Error('System API error')
  return r.json()
}
