'use client'

import React from 'react'
import { Palette, Zap, Trash2, Info, Check } from 'lucide-react'
import { ACCENTS, WALLPAPERS, useOS } from '@/lib/os/store'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'

export function SettingsApp() {
  const wallpaperId = useOS((s) => s.wallpaperId)
  const setWallpaper = useOS((s) => s.setWallpaper)
  const accentId = useOS((s) => s.accentId)
  const setAccent = useOS((s) => s.setAccent)
  const fpsOverlay = useOS((s) => s.fpsOverlay)
  const setFpsOverlay = useOS((s) => s.setFpsOverlay)
  const windows = useOS((s) => s.windows)
  const closeWindow = useOS((s) => s.closeWindow)

  return (
    <div className="h-full w-full overflow-y-auto os-scroll bg-[#0d1117] text-zinc-200 p-4 space-y-5">
      <section>
        <SectionTitle icon={<Palette className="w-3.5 h-3.5" />} title="Wallpaper" />
        <div className="grid grid-cols-3 gap-2.5">
          {WALLPAPERS.map((w) => (
            <button
              key={w.id}
              onClick={() => setWallpaper(w.id)}
              className={`relative h-20 rounded-lg border overflow-hidden transition-transform hover:scale-[1.02] ${
                wallpaperId === w.id ? 'ring-2' : 'border-white/10'
              }`}
              style={{
                background: w.css,
                ...(wallpaperId === w.id ? ({ '--tw-ring-color': 'var(--os-accent)' } as React.CSSProperties) : {}),
              }}
              aria-label={`Wallpaper ${w.name}`}
              aria-pressed={wallpaperId === w.id}
            >
              <span className="absolute inset-x-0 bottom-0 bg-black/45 text-[10px] py-0.5 text-center text-zinc-200">
                {w.name}
              </span>
              {wallpaperId === w.id && (
                <span
                  className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--os-accent)' }}
                >
                  <Check className="w-3 h-3 text-black" strokeWidth={3} />
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      <Separator className="bg-white/10" />

      <section>
        <SectionTitle icon={<Palette className="w-3.5 h-3.5" />} title="Accent color" />
        <div className="flex gap-2.5 flex-wrap">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAccent(a.id)}
              className={`w-9 h-9 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center ${
                accentId === a.id ? 'border-white' : 'border-transparent'
              }`}
              style={{ background: a.hex }}
              aria-label={`Accent ${a.name}`}
              aria-pressed={accentId === a.id}
              title={a.name}
            >
              {accentId === a.id && <Check className="w-4 h-4 text-black/80" strokeWidth={3} />}
            </button>
          ))}
        </div>
      </section>

      <Separator className="bg-white/10" />

      <section>
        <SectionTitle icon={<Zap className="w-3.5 h-3.5" />} title="Performance" />
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-zinc-200">FPS overlay</div>
            <div className="text-[11px] text-zinc-500">Show a live frame-rate counter on the desktop</div>
          </div>
          <Switch checked={fpsOverlay} onCheckedChange={setFpsOverlay} aria-label="Toggle FPS overlay" />
        </div>
        <p className="text-[11px] text-zinc-600 mt-2">
          Windows use compositor-driven transforms (translate3d) and rAF-coalesced input, so dragging stays at the
          display&apos;s full refresh rate.
        </p>
      </section>

      <Separator className="bg-white/10" />

      <section>
        <SectionTitle icon={<Info className="w-3.5 h-3.5" />} title="About" />
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-zinc-400 space-y-1">
          <div className="text-sm font-semibold text-zinc-100">AuraOS 1.0</div>
          <p>A web desktop for this sandbox environment: real bash terminal, file management, editor and live monitoring.</p>
          <p className="text-zinc-600">Next.js 16 · React 19 · Tailwind 4 · Zustand · {windows.length} window(s) open</p>
        </div>
        {windows.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 border-white/15 text-zinc-300 hover:bg-white/10 hover:text-zinc-100"
            onClick={() => windows.forEach((w) => closeWindow(w.id))}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Close all windows ({windows.length})
          </Button>
        )}
      </section>
    </div>
  )
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
      {icon}
      {title}
    </h2>
  )
}
