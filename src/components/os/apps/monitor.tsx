'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Cpu, MemoryStick, Clock, Server, Gauge } from 'lucide-react'
import { apiSystem, type SystemInfo } from '@/lib/os/api'
import { fpsMeter } from '@/lib/os/fps'
import { ACCENTS, useOS } from '@/lib/os/store'

function fmtUptime(s: number) {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

function gb(n: number) {
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

/** draws a smooth line chart onto a canvas — no chart lib, zero deps, fast */
function drawLine(canvas: HTMLCanvasElement, data: number[], max: number, color: string, targetLine?: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr
    canvas.height = h * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  for (let i = 1; i < 4; i++) {
    const y = (h / 4) * i
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }

  if (targetLine != null) {
    const y = h - (targetLine / max) * h
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (data.length < 2) return
  const step = w / (data.length - 1)
  ctx.strokeStyle = color
  ctx.lineWidth = 1.8
  ctx.lineJoin = 'round'
  ctx.beginPath()
  data.forEach((v, i) => {
    const x = i * step
    const y = h - Math.min(v / max, 1.02) * h
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()
  // fill under curve
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.closePath()
  ctx.fillStyle = color + '22'
  ctx.fill()
}

export function MonitorApp() {
  const accentId = useOS((s) => s.accentId)
  const accent = ACCENTS.find((a) => a.id === accentId)?.hex ?? ACCENTS[0].hex

  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [err, setErr] = useState(false)
  const cpuHist = useRef<number[]>([])
  const fpsHist = useRef<number[]>([])
  const cpuCanvas = useRef<HTMLCanvasElement>(null)
  const fpsCanvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const s = await apiSystem()
        if (!alive) return
        setInfo(s)
        setErr(false)
        cpuHist.current.push(s.cpuPercent)
        if (cpuHist.current.length > 60) cpuHist.current.shift()
      } catch {
        if (alive) setErr(true)
      }
    }
    void poll()
    const t = setInterval(poll, 2000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  // fps sampling + canvas drawing in one rAF-driven 500ms loop
  useEffect(() => {
    let raf = 0
    let lastDraw = 0
    const unsub = fpsMeter.subscribe(({ fps }) => {
      fpsHist.current.push(fps)
      if (fpsHist.current.length > 60) fpsHist.current.shift()
    })
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (t - lastDraw < 500) return
      lastDraw = t
      fpsMeter.pushHistory(Math.round(fpsMeter.fps))
      if (cpuCanvas.current) drawLine(cpuCanvas.current, cpuHist.current, 100, accent)
      if (fpsCanvas.current) drawLine(fpsCanvas.current, fpsHist.current, 75, accent, 60)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      unsub()
    }
  }, [accent])

  const memPct = info ? Math.round((info.memUsed / info.memTotal) * 100) : 0

  return (
    <div className="h-full w-full overflow-y-auto os-scroll bg-[#0d1117] text-zinc-200 p-4 space-y-4">
      {err && <p className="text-xs text-red-400">Lost contact with the system API. Retrying…</p>}
      {!info && !err && <p className="text-xs text-zinc-500 animate-pulse">Reading system stats…</p>}
      {info && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<Cpu className="w-4 h-4" />} label="CPU" value={`${info.cpuPercent}%`} sub={`${info.cores} cores`} />
            <StatCard icon={<MemoryStick className="w-4 h-4" />} label="Memory" value={`${memPct}%`} sub={`${gb(info.memUsed)} / ${gb(info.memTotal)}`} />
            <StatCard icon={<Gauge className="w-4 h-4" />} label="Load avg" value={info.load[0]?.toFixed(2) ?? '0'} sub={`1m · 5m ${info.load[1]?.toFixed(2)} · 15m ${info.load[2]?.toFixed(2)}`} />
            <StatCard icon={<Clock className="w-4 h-4" />} label="Uptime" value={fmtUptime(info.uptime)} sub={`${info.procCount} processes`} />
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="text-xs font-medium text-zinc-300 mb-2">CPU usage</div>
              <canvas ref={cpuCanvas} className="w-full h-28" aria-label="CPU history chart" />
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="text-xs font-medium text-zinc-300 mb-2 flex items-center gap-2">
                Display refresh (FPS)
                <span className="text-[10px] text-zinc-500">target 60</span>
              </div>
              <canvas ref={fpsCanvas} className="w-full h-28" aria-label="FPS history chart" />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-1.5 text-xs">
              <div className="font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5" /> Host
              </div>
              <Row k="Hostname" v={info.hostname} />
              <Row k="Platform" v={`${info.platform} ${info.arch}`} />
              <Row k="Kernel" v={info.release} />
              <Row k="CPU model" v={info.cpuModel} />
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs">
              <div className="font-medium text-zinc-300 mb-1.5">Top processes</div>
              <div className="grid grid-cols-[1fr_52px_52px] gap-x-2 text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                <span>Command</span>
                <span className="text-right">CPU%</span>
                <span className="text-right">MEM%</span>
              </div>
              {info.topProcs.map((p) => (
                <div key={p.pid + p.command} className="grid grid-cols-[1fr_52px_52px] gap-x-2 py-0.5 border-t border-white/5">
                  <span className="truncate text-zinc-300" title={`${p.command} (pid ${p.pid})`}>{p.command}</span>
                  <span className="text-right text-zinc-400">{p.cpu}</span>
                  <span className="text-right text-zinc-400">{p.mem}</span>
                </div>
              ))}
              {!info.topProcs.length && <span className="text-zinc-600 text-[11px]">unavailable</span>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="text-xl font-semibold text-zinc-100 mt-1">{value}</div>
      {sub && <div className="text-[10px] text-zinc-500 truncate">{sub}</div>}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-zinc-500 shrink-0">{k}</span>
      <span className="text-zinc-300 truncate" title={v}>{v}</span>
    </div>
  )
}
