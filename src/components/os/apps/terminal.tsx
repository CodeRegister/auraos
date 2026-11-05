'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { apiTerminal, apiSystem, apiList } from '@/lib/os/api'
import { useOS, type WinState, ACCENTS } from '@/lib/os/store'
import { APPS } from '../apps'

type Line = { text: string; kind: 'out' | 'err' | 'cmd' | 'sys' | 'accent' }

const HOME_TILDE = true

function shortenCwd(cwd: string, home: string) {
  if (HOME_TILDE && cwd === home) return '~'
  if (HOME_TILDE && cwd.startsWith(home + '/')) return '~' + cwd.slice(home.length)
  return cwd
}

function stripAnsi(s: string) {
   
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b\(B/g, '')
}

const MOTD = [
  { text: '  ╭──────────────────────────────────────╮', kind: 'accent' as const },
  { text: '  │   A U R A O S  ·  web desktop  v1.0  │', kind: 'accent' as const },
  { text: '  ╰──────────────────────────────────────╯', kind: 'accent' as const },
  { text: "  Real bash. Type 'help' for built-ins.", kind: 'sys' as const },
]

const HELP = [
  'Built-in commands:',
  '  help              this message',
  '  clear             clear the screen (or Ctrl+L)',
  '  neofetch          system info card',
  '  open <path>       open path in Files (e.g. open .)',
  '  edit <file>       open file in the Editor',
  '  apps              list installed apps',
  '  launch <app>      launch an app (files, terminal, browser, tier1, editor, monitor)',
  'Everything else runs in the real sandbox shell — ls, cd, cat, mkdir,',
  'rm, git, node, python, du, df, ps ... go wild.',
]

export function TerminalApp({ win }: { win: WinState }) {
  const openWindow = useOS((s) => s.openWindow)
  const accentId = useOS((s) => s.accentId)
  const accent = ACCENTS.find((a) => a.id === accentId)?.hex ?? ACCENTS[0].hex

  const [cwd, setCwd] = useState<string>((win.props.cwd as string) || '')
  const [lines, setLines] = useState<Line[]>(MOTD)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const [hostname, setHostname] = useState('aura')
  const sessionIdRef = useRef(`term-${win.id}-${Math.random().toString(36).slice(2, 8)}`)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cwdRef = useRef(cwd)
  const homeRef = useRef('/home/z')

  cwdRef.current = cwd

  // resolve real HOME (server reports it when listing '')
  useEffect(() => {
    let cancelled = false
    apiList('')
      .then((d) => {
        if (cancelled) return
        homeRef.current = d.path
        if (!cwdRef.current) {
          setCwd(d.path)
          cwdRef.current = d.path
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const print = useCallback((text: string, kind: Line['kind'] = 'out') => {
    const pieces = text.split('\n')
    setLines((prev) => [...prev.slice(-2000), ...pieces.map((p) => ({ text: p, kind }))])
  }, [])

  useEffect(() => {
    apiSystem()
      .then((s) => setHostname(s.hostname))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines, busy])

  // focus terminal input whenever the window becomes active
  useEffect(() => {
    const el = inputRef.current
    if (el && !win.minimized) el.focus({ preventScroll: true })
     
  }, [])

  const doNeofetch = useCallback(async () => {
    try {
      const s = await apiSystem()
      const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)}G`
      const art = [
        '      ╱╲      ',
        '     ╱  ╲     ',
        '    ╱ ◈  ╲    ',
        '   ╱______╲   ',
        '  ╱╱    ╲╲    ',
      ]
      const info = [
        `you@${s.hostname}`,
        '─────────────────',
        `OS: AuraOS 1.0 (web desktop)`,
        `Kernel: ${s.platform} ${s.release} ${s.arch}`,
        `Host: ${s.hostname}`,
        `CPU: ${s.cpuModel} (${s.cores}) @ ${s.cpuPercent}%`,
        `Memory: ${gb(s.memUsed)} / ${gb(s.memTotal)}`,
        `Uptime: ${Math.floor(s.uptime / 60)} mins`,
        `Shell: bash`,
        `Display: ${window.innerWidth}x${window.innerHeight} @ ${Math.round(window.devicePixelRatio * 60)}Hz-ish`,
      ]
      const rows = Math.max(art.length, info.length)
      const out: Line[] = []
      for (let i = 0; i < rows; i++) {
        const a = (art[i] ?? '             ').padEnd(14)
        const b = info[i] ?? ''
        out.push({ text: a + b, kind: i === 0 ? 'accent' : 'out' })
      }
      setLines((prev) => [...prev.slice(-2000), ...out])
    } catch {
      print('neofetch failed to query system info', 'err')
    }
  }, [print])

  const runCommand = useCallback(
    async (raw: string) => {
      const cmd = raw.trim()
      print(`${shortenCwd(cwdRef.current, homeRef.current)} $ ${cmd}`, 'cmd')
      if (!cmd) return
      setHistory((h) => [...h.slice(-200), cmd])
      setHistIdx(-1)

      const [bin, ...args] = cmd.split(/\s+/)

      if (bin === 'clear') {
        setLines([])
        return
      }
      if (bin === 'help') {
        setLines((prev) => [...prev.slice(-2000), ...HELP.map((t) => ({ text: t, kind: 'sys' as const }))])
        return
      }
      if (bin === 'neofetch') {
        await doNeofetch()
        return
      }
      if (bin === 'apps') {
        setLines((prev) => [
          ...prev.slice(-2000),
          ...APPS.map((a) => ({ text: `  ${a.id.padEnd(10)} ${a.name} — ${a.description}`, kind: 'sys' as const })),
        ])
        return
      }
      if (bin === 'launch') {
        const app = APPS.find((a) => a.id === args[0])
        if (!app) {
          print(`launch: unknown app '${args[0] ?? ''}'. Try: apps`, 'err')
          return
        }
        openWindow(app.id)
        print(`launching ${app.name}...`, 'sys')
        return
      }
      if (bin === 'open') {
        const p = args[0] || '.'
        const resolved = p.startsWith('/') ? p : p === '~' ? homeRef.current : requirePath(cwdRef.current, p)
        openWindow('files', { path: resolved })
        print(`opening ${shortenCwd(resolved, homeRef.current)} in Files...`, 'sys')
        return
      }
      if (bin === 'edit') {
        const p = args[0]
        if (!p) {
          print('edit: missing file path', 'err')
          return
        }
        const resolved = p.startsWith('/') ? p : requirePath(cwdRef.current, p)
        openWindow('editor', { path: resolved })
        print(`opening ${p} in Editor...`, 'sys')
        return
      }

      setBusy(true)
      try {
        const res = await apiTerminal(sessionIdRef.current, cwdRef.current, cmd)
        if (res.output) print(stripAnsi(res.output.replace(/\n$/, '')), 'out')
        setCwd(res.cwd)
        cwdRef.current = res.cwd
      } catch (e) {
        print(e instanceof Error ? e.message : 'command failed', 'err')
      } finally {
        setBusy(false)
        requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
      }
    },
    [print, doNeofetch, openWindow]
  )

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !busy) {
      const v = input
      setInput('')
      void runCommand(v)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!history.length) return
      const idx = histIdx === -1 ? history.length - 1 : Math.max(0, histIdx - 1)
      setHistIdx(idx)
      setInput(history[idx])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (histIdx === -1) return
      const idx = histIdx + 1
      if (idx >= history.length) {
        setHistIdx(-1)
        setInput('')
      } else {
        setHistIdx(idx)
        setInput(history[idx])
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      setLines([])
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault()
      print(`${shortenCwd(cwdRef.current, homeRef.current)} $ ${input}^C`, 'cmd')
      setInput('')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      // lightweight path completion against the last token
      const tokens = input.split(/\s+/)
      const last = tokens[tokens.length - 1] ?? ''
      if (!last.includes(' ')) void complete(last, tokens)
    }
  }

  const complete = async (last: string, tokens: string[]) => {
    try {
      const slash = last.lastIndexOf('/')
      const dirPart = slash === -1 ? '.' : last.slice(0, slash) || '/'
      const frag = slash === -1 ? last : last.slice(slash + 1)
      const dirAbs = dirPart.startsWith('/') ? dirPart : requirePath(cwdRef.current, dirPart)
      const res = await fetch(`/api/fs/list?path=${encodeURIComponent(dirAbs)}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const matches: string[] = (data.entries ?? [])
        .filter((en: { name: string }) => en.name.startsWith(frag))
        .map((en: { name: string; type: string }) => en.name + (en.type === 'directory' ? '/' : ''))
      if (matches.length === 1) {
        const done = (slash === -1 ? '' : last.slice(0, slash + 1)) + matches[0]
        tokens[tokens.length - 1] = done
        setInput(tokens.join(' '))
      } else if (matches.length > 1) {
        print(matches.join('   '), 'sys')
      }
    } catch {
      /* ignore */
    }
  }

  const promptCwd = shortenCwd(cwd || homeRef.current, homeRef.current)

  return (
    <div
      className="h-full w-full bg-[#0a0e0c] font-mono text-[12.5px] leading-[1.55] overflow-hidden flex flex-col"
      onClick={() => inputRef.current?.focus({ preventScroll: true })}
    >
      <div ref={scrollRef} className="flex-1 overflow-y-auto os-scroll px-3 py-2">
        {lines.map((l, i) => (
          <div
            key={i}
            className={
              l.kind === 'err'
                ? 'text-red-400 whitespace-pre-wrap break-words'
                : l.kind === 'cmd'
                  ? 'text-zinc-100 whitespace-pre-wrap break-words'
                  : l.kind === 'sys'
                    ? 'text-emerald-300/80 whitespace-pre-wrap break-words'
                    : l.kind === 'accent'
                      ? 'whitespace-pre font-bold'
                      : 'text-zinc-300 whitespace-pre-wrap break-words'
            }
            style={l.kind === 'accent' ? { color: accent } : undefined}
          >
            {l.text || '\u00A0'}
          </div>
        ))}
        {/* prompt */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="shrink-0 select-none" style={{ color: accent }}>
            you@{hostname}
          </span>
          <span className="text-zinc-500 shrink-0 select-none">{promptCwd}</span>
          <span className="text-zinc-500 shrink-0 select-none">$</span>
          {busy ? (
            <span className="text-zinc-500 animate-pulse">working…</span>
          ) : (
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              className="flex-1 min-w-[120px] bg-transparent outline-none border-none text-zinc-100 caret-emerald-400"
              style={{ caretColor: accent }}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-label="Terminal input"
            />
          )}
        </div>
      </div>
    </div>
  )
}

function requirePath(cwd: string, p: string): string {
  if (!cwd) return p
  if (p.startsWith('/')) return p
  const stack = cwd.split('/')
  for (const part of p.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/') || '/'
}
