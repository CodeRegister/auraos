'use client'

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  Sparkles, Power, Folder, SquareTerminal, Activity, Search,
  FolderPlus, FilePlus2, Image as ImageIcon, ChevronRight,
} from 'lucide-react'
import { ACCENTS, WALLPAPERS, useOS } from '@/lib/os/store'
import { fpsMeter } from '@/lib/os/fps'
import { APPS, AppIcon } from './apps'
import { WindowFrame, TASKBAR_H } from './window'

const emptySubscribe = () => () => {}

export function Desktop() {
  // hydration-safe mount flag without setState-in-effect
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    fpsMeter.start()
  }, [])

  useEffect(() => {
    if (!booting) return
    const t = setTimeout(() => setBooting(false), 1600)
    return () => clearTimeout(t)
  }, [booting])

  if (!mounted) {
    return (
      <div className="fixed inset-0 bg-[#05080a] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-emerald-400 animate-spin" />
      </div>
    )
  }

  return <Shell booting={booting} skipBoot={() => setBooting(false)} />
}

function Shell({ booting, skipBoot }: { booting: boolean; skipBoot: () => void }) {
  const powerOff = useOS((s) => s.powerOff)
  const reboot = useOS((s) => s.reboot)
  const accentId = useOS((s) => s.accentId)
  const accent = ACCENTS.find((a) => a.id === accentId)?.hex ?? ACCENTS[0].hex

  if (powerOff) return <PowerScreen onPowerOn={reboot} />
  if (booting) return <BootScreen onSkip={skipBoot} />

  return (
    <div
      className="fixed inset-0 overflow-hidden select-none"
      style={{ '--os-accent': accent } as React.CSSProperties}
    >
      <Wallpaper />
      <DesktopIcons />
      <Windows />
      <ContextMenu />
      <FpsOverlay />
      <StartMenu />
      <Taskbar />
      {/* welcome window on first run */}
      <FirstRun />
    </div>
  )
}

function FirstRun() {
  const openWindow = useOS((s) => s.openWindow)
  const windows = useOS((s) => s.windows)
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    if (!windows.some((w) => w.appId === 'welcome')) {
      const t = setTimeout(() => openWindow('welcome'), 250)
      return () => clearTimeout(t)
    }
     
  }, [])
  return null
}

function Wallpaper() {
  const wallpaperId = useOS((s) => s.wallpaperId)
  const wp = WALLPAPERS.find((w) => w.id === wallpaperId) ?? WALLPAPERS[0]
  return (
    <div className="absolute inset-0" style={{ background: wp.css }}>
      {/* subtle noise-free grid for depth */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(800px 500px at 50% 40%, black, transparent)',
          WebkitMaskImage: 'radial-gradient(800px 500px at 50% 40%, black, transparent)',
        }}
      />
    </div>
  )
}

function DesktopIcons() {
  const openWindow = useOS((s) => s.openWindow)
  const [sel, setSel] = useState<string | null>(null)

  const items = [
    ...APPS.filter((a) => a.id !== 'welcome').map((a) => ({ id: a.id, name: a.name, icon: a.icon, open: () => openWindow(a.id) })),
    { id: 'workspace', name: 'Workspace', icon: Folder, open: () => openWindow('files', {}) },
  ]

  return (
    <div
      className="absolute inset-0 pb-14"
      onClick={() => setSel(null)}
      onContextMenu={(e) => {
        // let the dedicated ContextMenu layer handle it
        e.stopPropagation()
      }}
    >
      <div className="grid grid-flow-col grid-rows-6 gap-1 p-2 w-fit" style={{ maxHeight: `calc(100vh - ${TASKBAR_H}px)` }}>
        {items.map((it) => (
          <button
            key={it.id}
            onClick={(e) => {
              e.stopPropagation()
              setSel(it.id)
            }}
            onDoubleClick={it.open}
            className={`w-20 h-20 rounded-lg flex flex-col items-center justify-center gap-1.5 transition-colors ${
              sel === it.id ? 'bg-white/15 ring-1 ring-white/25' : 'hover:bg-white/8'
            }`}
            aria-label={`Open ${it.name}`}
          >
            <it.icon className="w-9 h-9 text-zinc-200 drop-shadow" style={it.id === 'workspace' ? { color: 'var(--os-accent)' } : undefined} />
            <span className="text-[11px] text-zinc-200 drop-shadow px-1 rounded bg-black/25">{it.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Windows() {
  const windows = useOS((s) => s.windows)
  return (
    <div className="absolute inset-0 pointer-events-none">
      {windows.map((w) => (
        <WindowFrame key={w.id} win={w} />
      ))}
    </div>
  )
}

function ContextMenu() {
  const openWindow = useOS((s) => s.openWindow)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('resize', close)
    }
  }, [menu])

  // single desktop-level contextmenu handler
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.os-window') || target.closest('[data-taskbar]') || target.closest('[data-startmenu]')) return
      if (target.closest('button') || target.closest('input') || target.closest('textarea') || target.closest('[data-desktop-menu]')) return
      e.preventDefault()
      setMenu({ x: Math.min(e.clientX, window.innerWidth - 210), y: Math.min(e.clientY, window.innerHeight - 250) })
    }
    window.addEventListener('contextmenu', onCtx)
    return () => window.removeEventListener('contextmenu', onCtx)
  }, [])

  const items = [
    { label: 'New Folder', icon: FolderPlus, action: () => openWindow('files', { newFolder: true }) },
    { label: 'New File', icon: FilePlus2, action: () => openWindow('files', { newFile: true }) },
    { label: 'Open Terminal', icon: SquareTerminal, action: () => openWindow('terminal', {}) },
    { label: 'Open Files', icon: Folder, action: () => openWindow('files', {}) },
    { label: 'Display Settings', icon: ImageIcon, action: () => openWindow('settings') },
  ]

  return (
    <div
      className="absolute inset-0 z-[500]"
      style={{ pointerEvents: menu ? 'auto' : 'none' }}
      onClick={() => setMenu(null)}
    >
      {menu && (
        <div
          data-desktop-menu
          className="absolute min-w-48 rounded-lg border border-white/15 bg-[#161b22]/95 backdrop-blur-md shadow-2xl py-1 text-xs animate-in fade-in zoom-in-95 duration-100"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {items.map((it) => (
            <button
              key={it.label}
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-zinc-200 hover:bg-white/10"
              onClick={() => {
                it.action()
                setMenu(null)
              }}
            >
              <it.icon className="w-3.5 h-3.5 text-zinc-400" />
              {it.label}
            </button>
          ))}
          <div className="my-1 h-px bg-white/10" />
          <div className="px-3 py-1 text-[10px] text-zinc-500 flex items-center gap-1">
            AuraOS <ChevronRight className="w-3 h-3" /> sandbox workspace
          </div>
        </div>
      )}
    </div>
  )
}

function StartMenu() {
  const startOpen = useOS((s) => s.startOpen)
  const setStartOpen = useOS((s) => s.setStartOpen)
  const openWindow = useOS((s) => s.openWindow)
  const shutdown = useOS((s) => s.shutdown)
  const [q, setQ] = useState('')

  const filtered = APPS.filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()) || a.description.toLowerCase().includes(q.toLowerCase()))

  if (!startOpen) return null
  return (
    <div className="fixed inset-0 z-[900]" onClick={() => setStartOpen(false)} onContextMenu={(e) => e.preventDefault()}>
      <div
        data-startmenu
        className="absolute left-2 bottom-[58px] w-[340px] max-w-[calc(100vw-16px)] rounded-xl border border-white/15 bg-[#12161c]/95 backdrop-blur-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b border-white/10">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search apps…"
              className="w-full h-8 rounded-md bg-white/5 border border-white/10 pl-8 pr-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-white/25"
              aria-label="Search apps"
            />
          </div>
        </div>
        <div className="p-2 max-h-64 overflow-y-auto os-scroll">
          {filtered.map((a) => (
            <button
              key={a.id}
              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-white/10 text-left"
              onClick={() => {
                openWindow(a.id)
                setQ('')
              }}
            >
              <span className="w-8 h-8 rounded-md bg-white/5 border border-white/10 flex items-center justify-center">
                <a.icon className="w-4 h-4" style={{ color: 'var(--os-accent)' }} />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-zinc-200">{a.name}</span>
                <span className="block text-[10px] text-zinc-500 truncate">{a.description}</span>
              </span>
            </button>
          ))}
          {!filtered.length && <p className="text-xs text-zinc-600 text-center py-4">No apps match “{q}”</p>}
        </div>
        <div className="border-t border-white/10 px-3 py-2 flex items-center justify-between">
          <span className="text-[10px] text-zinc-500">AuraOS 1.0 · sandbox</span>
          <button
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-red-400 transition-colors"
            onClick={() => shutdown()}
          >
            <Power className="w-3.5 h-3.5" /> Power
          </button>
        </div>
      </div>
    </div>
  )
}

function Taskbar() {
  const windows = useOS((s) => s.windows)
  const activeId = useOS((s) => s.activeId)
  const toggleMinimize = useOS((s) => s.toggleMinimize)
  const startOpen = useOS((s) => s.startOpen)
  const setStartOpen = useOS((s) => s.setStartOpen)
  const setFpsOverlay = useOS((s) => s.setFpsOverlay)
  const fpsOverlay = useOS((s) => s.fpsOverlay)

  const [now, setNow] = useState<{ t: string; d: string } | null>(null)
  const [fps, setFps] = useState(0)

  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setNow({
        t: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        d: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      })
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => fpsMeter.subscribe((s) => setFps(s.fps)), [])

  const fpsColor = fps >= 55 ? '#34d399' : fps >= 30 ? '#fbbf24' : '#f87171'

  return (
    <div
      data-taskbar
      className="fixed bottom-0 left-0 right-0 z-[800] flex items-center gap-1 px-2 border-t border-white/10 bg-black/45 backdrop-blur-xl"
      style={{ height: TASKBAR_H }}
    >
      {/* start button */}
      <button
        aria-label="Start menu"
        aria-expanded={startOpen}
        onClick={() => setStartOpen(!startOpen)}
        className={`h-9 w-9 rounded-lg flex items-center justify-center transition-colors ${
          startOpen ? 'bg-white/15' : 'hover:bg-white/10'
        }`}
      >
        <span
          className="w-5 h-5 rounded-md flex items-center justify-center"
          style={{ background: 'var(--os-accent)' }}
        >
          <Sparkles className="w-3.5 h-3.5 text-black" />
        </span>
      </button>

      <div className="w-px h-6 bg-white/10 mx-1" />

      {/* window buttons */}
      <div className="flex-1 flex items-center gap-1 overflow-x-auto os-scroll-x min-w-0">
        {windows.map((w) => {
          const active = activeId === w.id && !w.minimized
          return (
            <button
              key={w.id}
              onClick={() => toggleMinimize(w.id)}
              className={`relative h-9 max-w-36 md:max-w-44 shrink-0 px-2.5 rounded-lg flex items-center gap-2 text-xs transition-colors ${
                active ? 'bg-white/15 text-zinc-100' : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
              } ${w.minimized ? 'opacity-60' : ''}`}
              aria-label={`${w.title}${w.minimized ? ' (minimized)' : ''}`}
            >
              <AppIcon appId={w.appId} className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{w.title}</span>
              {active && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-0.5 w-5 rounded-full" style={{ background: 'var(--os-accent)' }} />
              )}
            </button>
          )
        })}
      </div>

      {/* tray */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setFpsOverlay(!fpsOverlay)}
          className="h-7 px-2 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1.5"
          aria-label="Toggle FPS overlay"
          title="Toggle FPS overlay"
        >
          <Activity className="w-3 h-3" style={{ color: fpsColor }} />
          <span className="text-[11px] font-mono font-semibold" style={{ color: fpsColor }}>
            {fps}
          </span>
          <span className="text-[9px] text-zinc-500">fps</span>
        </button>
        <div className="text-right leading-tight px-1 hidden sm:block">
          <div className="text-[11px] font-medium text-zinc-200 tabular-nums">{now?.t ?? '--:--'}</div>
          <div className="text-[9px] text-zinc-500">{now?.d ?? ''}</div>
        </div>
      </div>
    </div>
  )
}

function FpsOverlay() {
  const show = useOS((s) => s.fpsOverlay)
  const [fps, setFps] = useState(0)
  useEffect(() => (show ? fpsMeter.subscribe((s) => setFps(s.fps)) : undefined), [show])
  if (!show) return null
  const color = fps >= 55 ? '#34d399' : fps >= 30 ? '#fbbf24' : '#f87171'
  return (
    <div className="fixed top-3 right-3 z-[950] pointer-events-none rounded-lg border border-white/15 bg-black/55 backdrop-blur px-3 py-1.5 shadow-xl">
      <div className="text-[9px] uppercase tracking-widest text-zinc-500">frames / second</div>
      <div className="text-lg font-bold font-mono tabular-nums leading-none" style={{ color }}>
        {fps}
      </div>
    </div>
  )
}

function BootScreen({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="fixed inset-0 z-[2000] bg-[#05080a] flex flex-col items-center justify-center gap-6 cursor-pointer" onClick={onSkip}>
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center animate-in zoom-in-50 duration-500"
        style={{ background: 'var(--os-accent)', boxShadow: '0 10px 50px color-mix(in srgb, var(--os-accent) 40%, transparent)' }}
      >
        <Sparkles className="w-8 h-8 text-black" />
      </div>
      <div className="text-center animate-in fade-in duration-700">
        <div className="text-xl font-semibold tracking-widest text-zinc-100">AURA<span style={{ color: 'var(--os-accent)' }}>OS</span></div>
        <div className="text-[10px] text-zinc-600 mt-1">web desktop for your sandbox</div>
      </div>
      <div className="w-40 h-1 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full animate-progress" style={{ background: 'var(--os-accent)' }} />
      </div>
    </div>
  )
}

function PowerScreen({ onPowerOn }: { onPowerOn: () => void }) {
  return (
    <div className="fixed inset-0 z-[2000] bg-black flex flex-col items-center justify-center gap-4">
      <p className="text-sm text-zinc-500">AuraOS has shut down.</p>
      <button
        onClick={onPowerOn}
        className="mt-2 flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-100 border border-white/15 hover:border-white/40 rounded-lg px-4 py-2 transition-colors"
      >
        <Power className="w-3.5 h-3.5" /> Power on
      </button>
    </div>
  )
}
