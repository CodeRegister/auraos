'use client'

import React, { useEffect, useState } from 'react'
import { Brain, RotateCw, Globe } from 'lucide-react'
import { useOS, type WinState } from '@/lib/os/store'

/**
 * Tier 1 — Memory Training (github.com/CodeRegister/tier-1), vendored as an
 * AuraOS applet. Zero-dependency static site served from /tier1/index.html;
 * it only touches its own JSON data banks and localStorage, so the frame is
 * same-origin first-party content.
 */
export function Tier1App({ win }: { win: WinState }) {
  const setTitle = useOS((s) => s.setTitle)
  const openWindow = useOS((s) => s.openWindow)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setTitle(win.id, 'Tier 1 · Memory Training')
  }, [win.id, setTitle])

  return (
    <div className="h-full w-full flex flex-col bg-[#0d1117] text-zinc-200">
      <div className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 border-b border-white/10 bg-black/30">
        <span className="w-6 h-6 rounded-md bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
          <Brain className="w-3.5 h-3.5" style={{ color: 'var(--os-accent)' }} />
        </span>
        <div className="min-w-0 leading-tight">
          <div className="text-[11px] font-medium text-zinc-200 truncate">Tier 1 — Memory Training</div>
          <div className="text-[9px] text-zinc-500 truncate">
            vendored applet · github.com/CodeRegister/tier-1
          </div>
        </div>
        <div className="flex-1" />
        <button
          title="Open this applet in the AuraOS Browser"
          aria-label="Open applet in Browser"
          onClick={() => openWindow('browser', { url: `${window.location.origin}/tier1/index.html` })}
          className="h-7 w-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors"
        >
          <Globe className="w-3.5 h-3.5" />
        </button>
        <button
          title="Reload applet"
          aria-label="Reload applet"
          onClick={() => {
            setLoading(true)
            setReloadKey((k) => k + 1)
          }}
          className="h-7 w-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors"
        >
          <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="shrink-0 h-0.5 bg-white/5 overflow-hidden">
        {loading && (
          <div className="h-full w-1/3 rounded-full animate-progress" style={{ background: 'var(--os-accent)' }} />
        )}
      </div>

      <div className="flex-1 min-h-0 relative">
        <iframe
          key={reloadKey}
          src={`/tier1/index.html?v=${reloadKey}`}
          title="Tier 1 — Memory Training"
          className="absolute inset-0 w-full h-full bg-[#0b0e14]"
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads"
          onLoad={() => setLoading(false)}
        />
      </div>
    </div>
  )
}
