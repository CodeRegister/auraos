'use client'

import React, { useCallback, useEffect, useRef } from 'react'
import { useOS, type WinState } from '@/lib/os/store'
import { AppHost, AppIcon } from './apps'

export const TASKBAR_H = 52
const MIN_W = 340
const MIN_H = 200
const EDGE = 6 // px from screen edge that triggers snapping

type SnapZone = 'left' | 'right' | 'top' | null

/**
 * Window frame with GPU-composited drag & resize.
 *
 * Performance contract (60fps):
 * - During drag/resize we NEVER call setState. Pointer moves are coalesced
 *   into a requestAnimationFrame loop that writes `transform: translate3d()`
 *   and width/height directly to the DOM node — no React re-render, no
 *   layout thrash; the compositor handles the movement.
 * - React state is committed exactly once, on pointerup.
 * - CSS transitions are disabled while interacting (body.os-interacting).
 */
export function WindowFrame({ win }: { win: WinState }) {
  const ref = useRef<HTMLDivElement>(null)
  const snapPreview = useRef<HTMLDivElement>(null)

  const focusWindow = useOS((s) => s.focusWindow)
  const closeWindow = useOS((s) => s.closeWindow)
  const minimizeWindow = useOS((s) => s.minimizeWindow)
  const toggleMaximize = useOS((s) => s.toggleMaximize)
  const setGeometry = useOS((s) => s.setGeometry)
  const activeId = useOS((s) => s.activeId)

  const isActive = activeId === win.id
  const taskbarH = TASKBAR_H

  const [viewport, setViewport] = React.useState({ w: 1280, h: 800 })
  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const geom = win.maximized
    ? { x: 0, y: 0, w: viewport.w, h: viewport.h - taskbarH }
    : { x: win.x, y: win.y, w: win.w, h: win.h }

  // ---- interaction plumbing -------------------------------------------
  const interaction = useRef<{
    raf: number
    dirty: boolean
    type: 'drag' | 'resize'
    mode: string
    startX: number
    startY: number
    orig: { x: number; y: number; w: number; h: number }
    next: { x: number; y: number; w: number; h: number }
    snap: SnapZone
  }>({
    raf: 0, dirty: false, type: 'drag', mode: '', startX: 0, startY: 0,
    orig: { x: 0, y: 0, w: 0, h: 0 }, next: { x: 0, y: 0, w: 0, h: 0 }, snap: null,
  })

  const applyStyle = useCallback((g: { x: number; y: number; w: number; h: number }) => {
    const el = ref.current
    if (!el) return
    el.style.transform = `translate3d(${g.x}px, ${g.y}px, 0)`
    el.style.width = `${g.w}px`
    el.style.height = `${g.h}px`
  }, [])

  const showSnapPreview = useCallback((zone: SnapZone) => {
    const el = snapPreview.current
    if (!el) return
    if (!zone) {
      el.style.opacity = '0'
      return
    }
    const vw = window.innerWidth
    const vh = window.innerHeight - taskbarH
    const r =
      zone === 'top'
        ? { x: 8, y: 8, w: vw - 16, h: vh - 16 }
        : zone === 'left'
          ? { x: 8, y: 8, w: vw / 2 - 16, h: vh - 16 }
          : { x: vw / 2 + 8, y: 8, w: vw / 2 - 16, h: vh - 16 }
    el.style.opacity = '1'
    el.style.transform = `translate3d(${r.x}px, ${r.y}px, 0)`
    el.style.width = `${r.w}px`
    el.style.height = `${r.h}px`
  }, [taskbarH])

  const computeSnap = (cx: number, cy: number): SnapZone => {
    const vw = window.innerWidth
    if (cy <= EDGE) return 'top'
    if (cx <= EDGE) return 'left'
    if (cx >= vw - EDGE) return 'right'
    return null
  }

  const snapGeom = (zone: Exclude<SnapZone, null>) => {
    const vw = window.innerWidth
    const vh = window.innerHeight - taskbarH
    if (zone === 'top') return { x: 0, y: 0, w: vw, h: vh, maximize: true }
    if (zone === 'left') return { x: 0, y: 0, w: Math.round(vw / 2), h: vh, maximize: false }
    return { x: Math.round(vw / 2), y: 0, w: Math.round(vw / 2), h: vh, maximize: false }
  }

  useEffect(() => {
    const it = interaction.current
    return () => {
      if (it.raf) cancelAnimationFrame(it.raf)
      document.body.classList.remove('os-interacting')
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent, type: 'drag' | 'resize', mode = '') => {
    if (e.button !== 0) return
    if (type === 'drag' && win.maximized) return
    e.preventDefault()
    e.stopPropagation()
    focusWindow(win.id)

    const it = interaction.current
    it.type = type
    it.mode = mode
    it.dirty = false
    it.raf = 0
    it.startX = e.clientX
    it.startY = e.clientY
    it.orig = { ...geom }
    it.next = { ...geom }
    it.snap = null
    document.body.classList.add('os-interacting')

    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)

    const flush = () => {
      it.raf = 0
      if (!it.dirty) return
      it.dirty = false
      applyStyle(it.next)
      if (it.type === 'drag') showSnapPreview(it.snap)
    }

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - it.startX
      const dy = ev.clientY - it.startY
      if (it.type === 'drag') {
        it.next = { ...it.orig, x: it.orig.x + dx, y: Math.max(-8, it.orig.y + dy) }
        it.snap = computeSnap(ev.clientX, ev.clientY)
      } else {
        const { orig, mode: m } = it
        let { x, y, w, h } = orig
        if (m.includes('e')) w = Math.max(MIN_W, orig.w + dx)
        if (m.includes('s')) h = Math.max(MIN_H, orig.h + dy)
        if (m.includes('w')) {
          const nw = Math.max(MIN_W, orig.w - dx)
          x = orig.x + (orig.w - nw)
          w = nw
        }
        if (m.includes('n')) {
          const nh = Math.max(MIN_H, orig.h - dy)
          y = Math.max(-8, orig.y + (orig.h - nh))
          h = orig.y + orig.h - y
        }
        it.next = { x, y, w, h }
      }
      it.dirty = true
      if (!it.raf) it.raf = requestAnimationFrame(flush)
    }

    const onUp = (ev: PointerEvent) => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      const wasType = it.type
      const zone = wasType === 'drag' ? computeSnap(ev.clientX, ev.clientY) : null
      if (it.raf) cancelAnimationFrame(it.raf)
      it.raf = 0
      it.dirty = false
      document.body.classList.remove('os-interacting')
      showSnapPreview(null)

      if (wasType === 'drag' && zone) {
        const g = snapGeom(zone)
        setGeometry(win.id, { x: g.x, y: g.y, w: g.w, h: g.h })
        if (g.maximize && !win.maximized) toggleMaximize(win.id)
      } else if (wasType === 'drag') {
        const vw = window.innerWidth
        const vh = window.innerHeight - taskbarH
        setGeometry(win.id, {
          x: Math.min(Math.max(it.next.x, -it.next.w + 90), vw - 90),
          y: Math.min(Math.max(it.next.y, -8), vh - 44),
          w: it.next.w,
          h: it.next.h,
        })
      } else {
        setGeometry(win.id, { x: it.next.x, y: it.next.y, w: it.next.w, h: it.next.h })
      }
    }

    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }

  const minimized = win.minimized
  const minimizedCls = minimized
    ? 'opacity-0 scale-90 pointer-events-none invisible'
    : 'opacity-100 scale-100 visible'
  const transition = minimized
    ? 'opacity 160ms ease, transform 160ms ease, visibility 0s 160ms'
    : 'opacity 160ms ease, transform 160ms ease, width 160ms ease, height 160ms ease'

  return (
    <>
      {/* snap preview — viewport-fixed, only visible during this window's drag */}
      <div
        ref={snapPreview}
        aria-hidden
        className="fixed left-0 top-0 z-[9999] rounded-xl border-2 border-dashed pointer-events-none opacity-0"
        style={{
          borderColor: 'var(--os-accent)',
          background: 'color-mix(in srgb, var(--os-accent) 10%, transparent)',
          transitionProperty: 'opacity',
          transitionDuration: '80ms',
        }}
      />
      <div
        ref={ref}
        role="dialog"
        aria-label={win.title}
        className={[
          'os-window pointer-events-auto absolute left-0 top-0 flex flex-col rounded-xl overflow-hidden border text-sm',
          'bg-[#10141b]/95 text-zinc-100 shadow-2xl',
          isActive ? 'border-white/20 shadow-black/60' : 'border-white/10 shadow-black/40',
          minimizedCls,
        ].join(' ')}
        style={{
          zIndex: win.z,
          width: geom.w,
          height: geom.h,
          transform: `translate3d(${geom.x}px, ${geom.y}px, 0)`,
          willChange: 'transform, width, height',
          transition,
        }}
        onPointerDownCapture={() => {
          if (!isActive) focusWindow(win.id)
        }}
      >
        {/* title bar */}
        <div
          className="os-drag flex items-center gap-2 h-9 shrink-0 select-none px-3 border-b border-white/10 bg-white/[0.04] cursor-default touch-none"
          onPointerDown={(e) => onPointerDown(e, 'drag')}
          onDoubleClick={() => toggleMaximize(win.id)}
        >
          <div className="flex items-center gap-1.5 mr-1 shrink-0">
            <button
              aria-label="Close window"
              className="group w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-110 flex items-center justify-center"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => closeWindow(win.id)}
            >
              <span className="opacity-0 group-hover:opacity-60 text-[8px] leading-none text-black font-bold">✕</span>
            </button>
            <button
              aria-label="Minimize window"
              className="group w-3 h-3 rounded-full bg-[#febc2e] hover:brightness-110 flex items-center justify-center"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => minimizeWindow(win.id)}
            >
              <span className="opacity-0 group-hover:opacity-60 text-[9px] leading-none text-black font-bold">−</span>
            </button>
            <button
              aria-label="Maximize window"
              className="group w-3 h-3 rounded-full bg-[#28c840] hover:brightness-110 flex items-center justify-center"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => toggleMaximize(win.id)}
            >
              <span className="opacity-0 group-hover:opacity-60 text-[8px] leading-none text-black font-bold">＋</span>
            </button>
          </div>
          <AppIcon appId={win.appId} className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <div className="text-xs font-medium text-zinc-300 truncate flex-1 text-center pr-14">
            {win.title}
          </div>
        </div>

        {/* content */}
        <div className="flex-1 min-h-0 relative">
          <AppHost win={win} />
        </div>

        {/* resize handles */}
        {!win.maximized && (
          <>
            <div className="os-resize absolute top-0 left-3 right-3 h-1.5 cursor-n-resize touch-none" onPointerDown={(e) => onPointerDown(e, 'resize', 'n')} />
            <div className="os-resize absolute bottom-0 left-3 right-3 h-1.5 cursor-s-resize touch-none" onPointerDown={(e) => onPointerDown(e, 'resize', 's')} />
            <div className="os-resize absolute left-0 top-3 bottom-3 w-1.5 cursor-w-resize touch-none" onPointerDown={(e) => onPointerDown(e, 'resize', 'w')} />
            <div className="os-resize absolute right-0 top-3 bottom-3 w-1.5 cursor-e-resize touch-none" onPointerDown={(e) => onPointerDown(e, 'resize', 'e')} />
            <div className="os-resize absolute top-0 left-0 w-3.5 h-3.5 cursor-nw-resize touch-none" onPointerDown={(e) => onPointerDown(e, 'resize', 'nw')} />
            <div className="os-resize absolute top-0 right-0 w-3.5 h-3.5 cursor-ne-resize touch-none" onPointerDown={(e) => onPointerDown(e, 'resize', 'ne')} />
            <div className="os-resize absolute bottom-0 left-0 w-3.5 h-3.5 cursor-sw-resize touch-none" onPointerDown={(e) => onPointerDown(e, 'resize', 'sw')} />
            <div className="os-resize absolute bottom-0 right-0 w-3.5 h-3.5 cursor-se-resize touch-none" onPointerDown={(e) => onPointerDown(e, 'resize', 'se')} />
          </>
        )}
      </div>
    </>
  )
}
