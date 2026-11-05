import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { randomBytes } from 'crypto'
import { safeResolve, ROOT } from '@/lib/os/server-fs'

// Session working directories live for the lifetime of the server process.
// Module scope persists across requests in the Next.js dev server.
const sessions = new Map<string, string>()

const TIMEOUT_MS = 60_000
const MAX_OUTPUT = 512 * 1024 // 512 KB

type RunResult = { output: string; code: number; timedOut: boolean; newCwd: string | null }

function run(cmd: string, cwd: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const nonce = randomBytes(6).toString('hex')
    // Wrap the command so the same bash instance reports its PWD and exit code
    // afterwards — this is what makes `cd` persist across requests.
    const script = `${cmd}\n__aura_rc=$?; printf "\\n@@AURA:${nonce}:%s:%d@@" "$PWD" "$__aura_rc"`
    const child = spawn('bash', ['-c', script], {
      cwd,
      env: {
        ...process.env,
        HOME: ROOT,
        TERM: 'dumb',
        NO_COLOR: '1',
        GIT_PAGER: 'cat',
        PAGER: 'cat',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let out = ''
    let err = ''
    let timedOut = false
    let truncated = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, TIMEOUT_MS)

    child.stdout.on('data', (d: Buffer) => {
      if (out.length < MAX_OUTPUT) out += d.toString()
      else truncated = true
    })
    child.stderr.on('data', (d: Buffer) => {
      if (err.length < MAX_OUTPUT) err += d.toString()
      else truncated = true
    })

    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ output: `${out}${err}\nbash: ${e.message}\n`, code: 127, timedOut, newCwd: null })
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      let output = out
      if (err && !out.endsWith(err)) output += err
      if (truncated) output += '\n(output truncated at 512 KB)\n'
      if (timedOut) output += `\n^ killed: command exceeded ${TIMEOUT_MS / 1000}s limit\n`

      // parse trailing marker: @@AURA:nonce:cwd:rc@@
      let newCwd: string | null = null
      let rc = code ?? 0
      const marker = `@@AURA:${nonce}:`
      const idx = output.lastIndexOf(marker)
      if (idx !== -1) {
        const end = output.indexOf('@@', idx + marker.length)
        if (end !== -1) {
          const payload = output.slice(idx + marker.length, end)
          const sep = payload.lastIndexOf(':')
          if (sep !== -1) {
            newCwd = payload.slice(0, sep)
            rc = parseInt(payload.slice(sep + 1), 10)
            if (Number.isNaN(rc)) rc = code ?? 0
          }
          output = output.slice(0, idx)
        }
      }
      resolve({ output, code: rc, timedOut, newCwd })
    })
  })
}

export async function POST(req: NextRequest) {
  let body: { sessionId?: string; cwd?: string; cmd?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const sessionId = body.sessionId || 'default'
  const cmd = body.cmd ?? ''
  if (typeof cmd !== 'string' || cmd.length > 20_000)
    return NextResponse.json({ error: 'Command too long' }, { status: 400 })

  // resolve cwd: client-sent (first command) or stored session cwd
  let cwd = sessions.get(sessionId)
  if (!cwd) {
    cwd = safeResolve(body.cwd || ROOT) || ROOT
  } else if (body.cwd) {
    const c = safeResolve(body.cwd)
    if (c) cwd = c
  }
  sessions.set(sessionId, cwd)

  const { output, code, timedOut, newCwd } = await run(cmd, cwd)

  let finalCwd = cwd
  if (newCwd) {
    const safe = safeResolve(newCwd)
    if (safe) {
      finalCwd = safe
      sessions.set(sessionId, safe)
    }
  }

  return NextResponse.json({ output, cwd: finalCwd, code, timedOut })
}
