'use client'

import React from 'react'
import { Folder, SquareTerminal, Activity, Settings, Sparkles, MousePointerClick, MoveDiagonal } from 'lucide-react'
import { useOS } from '@/lib/os/store'
import { Button } from '@/components/ui/button'

const LAUNCH = [
  { id: 'files', name: 'Files', icon: Folder, desc: 'Manage folders & files' },
  { id: 'terminal', name: 'Terminal', icon: SquareTerminal, desc: 'Real bash shell' },
  { id: 'monitor', name: 'Monitor', icon: Activity, desc: 'CPU · RAM · FPS' },
  { id: 'settings', name: 'Settings', icon: Settings, desc: 'Make it yours' },
]

export function WelcomeApp() {
  const openWindow = useOS((s) => s.openWindow)

  return (
    <div className="h-full w-full overflow-y-auto os-scroll bg-gradient-to-b from-[#0e1418] to-[#0a0e12] text-zinc-200 p-6 flex flex-col items-center text-center">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-lg"
        style={{ background: 'var(--os-accent)', boxShadow: '0 8px 30px color-mix(in srgb, var(--os-accent) 35%, transparent)' }}
      >
        <Sparkles className="w-7 h-7 text-black" />
      </div>
      <h1 className="text-lg font-semibold text-zinc-100">Welcome to AuraOS</h1>
      <p className="text-xs text-zinc-500 mt-1 max-w-xs">
        A desktop environment for this sandbox — with a real terminal, full folder management and a 60&nbsp;fps compositor-driven window system.
      </p>

      <div className="grid grid-cols-2 gap-2.5 mt-5 w-full max-w-sm">
        {LAUNCH.map((a) => (
          <button
            key={a.id}
            onClick={() => openWindow(a.id)}
            className="rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.09] p-3 flex flex-col items-center gap-1.5 transition-colors"
          >
            <a.icon className="w-5 h-5" style={{ color: 'var(--os-accent)' }} />
            <span className="text-xs font-medium text-zinc-200">{a.name}</span>
            <span className="text-[10px] text-zinc-500">{a.desc}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 w-full max-w-sm text-left space-y-1.5">
        <Tip icon={<MousePointerClick className="w-3.5 h-3.5" />}>
          Right-click the desktop for quick actions — new folder, new file, open terminal.
        </Tip>
        <Tip icon={<MoveDiagonal className="w-3.5 h-3.5" />}>
          Drag windows to the screen edges to snap them (halves or full). Double-click a title bar to maximize.
        </Tip>
        <Tip icon={<SquareTerminal className="w-3.5 h-3.5" />}>
          In the Terminal, try <code className="text-zinc-300">help</code>, <code className="text-zinc-300">neofetch</code> or{' '}
          <code className="text-zinc-300">open .</code> — everything else is real bash.
        </Tip>
      </div>

      <Button
        size="sm"
        className="mt-5 text-black font-medium"
        style={{ background: 'var(--os-accent)' }}
        onClick={() => openWindow('terminal', {})}
      >
        Open a terminal
      </Button>
    </div>
  )
}

function Tip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-[11px] text-zinc-400 items-start">
      <span className="mt-0.5 shrink-0" style={{ color: 'var(--os-accent)' }}>{icon}</span>
      <span>{children}</span>
    </div>
  )
}
