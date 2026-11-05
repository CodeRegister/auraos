'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft, ArrowRight, RotateCw, House, Globe, Shield, Zap, ExternalLink, Search, Lock,
} from 'lucide-react'
import { useOS, type WinState } from '@/lib/os/store'

const QUICK = [
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'Hacker News', url: 'https://news.ycombinator.com' },
  { name: 'MDN', url: 'https://developer.mozilla.org' },
  { name: 'Bing', url: 'https://www.bing.com' },
  { name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Main_Page' },
  { name: 'Example.com', url: 'https://example.com' },
]

/** turn free-form input into a URL; fall back to Bing search */
function normalize(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$|\?|#)/.test(s) || s.startsWith('localhost')) return `https://${s}`
  return `https://www.bing.com/search?q=${encodeURIComponent(s)}`
}

export function BrowserApp({ win }: { win: WinState }) {
  const setTitle = useOS((s) => s.setTitle)
  const initialUrl = typeof win.props.url === 'string' && win.props.url ? (win.props.url as string) : null

  const [stack, setStack] = useState<string[]>(initialUrl ? [initialUrl] : [])
  const [idx, setIdx] = useState<number>(initialUrl ? 0 : -1)
  const [input, setInput] = useState(initialUrl ?? '')
  const [mode, setMode] = useState<'proxy' | 'direct'>('proxy')
  const [reloadKey, setReloadKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [pageMeta, setPageMeta] = useState<{ title: string; url: string } | null>(null)

  const current = idx >= 0 ? stack[idx] : null

  const navigate = useCallback(
    (raw: string) => {
      const target = normalize(raw)
      if (!target) return
      setInput(target)
      setPageMeta(null)
      setLoading(true)
      const cur = idx >= 0 ? stack[idx] : null
      if (cur === target) {
        setReloadKey((k) => k + 1)
        return
      }
      const next = [...stack.slice(0, idx + 1), target]
      setStack(next)
      setIdx(next.length - 1)
    },
    [stack, idx],
  )

  const goBack = useCallback(() => {
    if (idx <= 0) return
    const i = idx === -1 ? stack.length - 2 : idx - 1
    if (i < 0) return
    setIdx(i)
    setInput(stack[i])
    setPageMeta(null)
    setLoading(true)
  }, [idx, stack])

  const goForward = useCallback(() => {
    if (idx === -1 || idx >= stack.length - 1) return
    const i = idx + 1
    setIdx(i)
    setInput(stack[i])
    setPageMeta(null)
    setLoading(true)
  }, [idx, stack])

  const goHome = useCallback(() => {
    setIdx(-1)
    setInput('')
    setPageMeta(null)
    setLoading(false)
  }, [])

  const reload = useCallback(() => {
    if (!current) return
    setPageMeta(null)
    setLoading(true)
    setReloadKey((k) => k + 1)
  }, [current])

  // messages from the proxied page: navigation + title sync
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; url?: string; title?: string } | null
      if (!d || typeof d !== 'object' || typeof d.type !== 'string' || !d.type.startsWith('auros-')) return
      if (d.type === 'auros-nav' && d.url) navigate(d.url)
      if (d.type === 'auros-meta') {
        setPageMeta({ title: d.title || '', url: d.url || '' })
        const t = (d.title || '').trim()
        if (t) setTitle(win.id, t.slice(0, 48))
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [navigate, setTitle, win.id])

  const src = current
    ? mode === 'proxy'
      ? `/api/proxy?url=${encodeURIComponent(current)}&k=${reloadKey}`
      : current
    : undefined

  const shownTitle = pageMeta?.title?.trim() || (loading ? 'Loading…' : current ? current : 'Start page')

  return (
    <div className="h-full w-full flex flex-col bg-[#0d1117] text-zinc-200">
      {/* toolbar */}
      <div className="shrink-0 flex items-center gap-1.5 px-2 py-1.5 border-b border-white/10 bg-black/30">
        <ToolBtn label="Back" disabled={idx === -1 || idx <= 0} onClick={goBack}>
          <ArrowLeft className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn label="Forward" disabled={idx === -1 || idx >= stack.length - 1} onClick={goForward}>
          <ArrowRight className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn label="Reload" disabled={!current} onClick={reload}>
          <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </ToolBtn>
        <ToolBtn label="Home" onClick={goHome}>
          <House className="w-3.5 h-3.5" />
        </ToolBtn>

        <form
          className="flex-1 min-w-0"
          onSubmit={(e) => {
            e.preventDefault()
            navigate(input)
          }}
        >
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
              {current ? (
                <Lock className="w-3 h-3 text-emerald-400/80" />
              ) : (
                <Search className="w-3 h-3 text-zinc-500" />
              )}
            </span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search or enter address"
              spellCheck={false}
              aria-label="Address bar"
              className="w-full h-7 rounded-md bg-white/5 border border-white/10 pl-7 pr-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-white/25"
            />
          </div>
        </form>

        <button
          onClick={() => setMode((m) => (m === 'proxy' ? 'direct' : 'proxy'))}
          title={
            mode === 'proxy'
              ? 'Proxy mode — loads any site (links rewritten by the AuraOS proxy). Switch to Direct for full JS sites.'
              : 'Direct mode — real URL in the frame; sites that forbid embedding will show an error.'
          }
          className={`h-7 px-2 rounded-md border flex items-center gap-1.5 text-[10px] font-medium transition-colors ${
            mode === 'proxy'
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/15'
              : 'border-amber-400/30 bg-amber-400/10 text-amber-300 hover:bg-amber-400/15'
          }`}
          aria-label="Toggle proxy mode"
        >
          {mode === 'proxy' ? <Shield className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
          {mode === 'proxy' ? 'Proxy' : 'Direct'}
        </button>

        {current && (
          <ToolBtn label="Open in real browser tab" onClick={() => window.open(current, '_blank', 'noopener')}>
            <ExternalLink className="w-3.5 h-3.5" />
          </ToolBtn>
        )}
      </div>

      {/* loading bar */}
      <div className="shrink-0 h-0.5 bg-white/5 overflow-hidden">
        {loading && (
          <div className="h-full w-1/3 rounded-full animate-progress" style={{ background: 'var(--os-accent)' }} />
        )}
      </div>

      {/* viewport */}
      <div className="flex-1 min-h-0 relative bg-white/[0.02]">
        {src ? (
          <iframe
            key={`${current}-${reloadKey}-${mode}`}
            src={src}
            title="AuraOS Browser viewport"
            className="absolute inset-0 w-full h-full bg-white"
            sandbox="allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"
            onLoad={() => setLoading(false)}
          />
        ) : (
          <StartPage onGo={navigate} />
        )}
      </div>

      {/* status bar */}
      <div className="shrink-0 flex items-center gap-2 px-2.5 h-6 border-t border-white/10 bg-black/30 text-[10px] text-zinc-500">
        <Globe className="w-3 h-3 text-zinc-600 shrink-0" />
        <span className="truncate text-zinc-400">{shownTitle}</span>
        {pageMeta?.url && <span className="truncate ml-auto hidden sm:inline">{pageMeta.url}</span>}
      </div>
    </div>
  )
}

function ToolBtn({
  label, disabled, onClick, children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
    >
      {children}
    </button>
  )
}

function StartPage({ onGo }: { onGo: (url: string) => void }) {
  const [q, setQ] = useState('')
  return (
    <div className="h-full w-full overflow-y-auto os-scroll flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-5">
        <div
          className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--os-accent)', boxShadow: '0 10px 40px color-mix(in srgb, var(--os-accent) 35%, transparent)' }}
        >
          <Globe className="w-7 h-7 text-black" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">AuraOS Browser</h1>
          <p className="text-xs text-zinc-500 mt-1">The real web, inside your desktop. Links are rewritten by the built-in proxy.</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            onGo(q)
          }}
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search Bing or type a URL"
              spellCheck={false}
              aria-label="Search or type a URL"
              className="w-full h-9 rounded-lg bg-white/5 border border-white/10 pl-9 pr-3 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-white/25"
            />
          </div>
        </form>

        <div className="grid grid-cols-3 gap-2">
          {QUICK.map((s) => (
            <button
              key={s.name}
              onClick={() => onGo(s.url)}
              className="rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/10 hover:border-white/20 transition-colors px-2 py-3 text-[11px] text-zinc-300"
            >
              {s.name}
            </button>
          ))}
        </div>

        <p className="text-[10px] text-zinc-600 leading-relaxed">
          Proxy mode renders sites through <code className="text-zinc-500">/api/proxy</code> so frame-blocking sites still load.
          Heavy JS apps work best in Direct mode. Some sites (Wikipedia, DuckDuckGo) block cloud IPs — you'll get a friendly error page.
        </p>
      </div>
    </div>
  )
}
