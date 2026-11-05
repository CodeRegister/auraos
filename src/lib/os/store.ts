'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type WindowProps = Record<string, unknown>

export type WinState = {
  id: string
  appId: string
  title: string
  props: WindowProps
  x: number
  y: number
  w: number
  h: number
  minimized: boolean
  maximized: boolean
  z: number
  restore?: { x: number; y: number; w: number; h: number }
}

export type Accent = { id: string; name: string; hex: string }

export const ACCENTS: Accent[] = [
  { id: 'emerald', name: 'Emerald', hex: '#10b981' },
  { id: 'violet', name: 'Violet', hex: '#a78bfa' },
  { id: 'amber', name: 'Amber', hex: '#f59e0b' },
  { id: 'rose', name: 'Rose', hex: '#fb7185' },
  { id: 'cyan', name: 'Teal', hex: '#2dd4bf' },
]

export type Wallpaper = { id: string; name: string; css: string }

export const WALLPAPERS: Wallpaper[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    css: 'radial-gradient(1100px 700px at 18% 8%, rgba(16,185,129,0.28), transparent 62%), radial-gradient(900px 650px at 82% 28%, rgba(45,212,191,0.16), transparent 60%), radial-gradient(1000px 900px at 55% 95%, rgba(167,139,250,0.14), transparent 60%), linear-gradient(160deg, #070b10 0%, #0a1114 55%, #070a0c 100%)',
  },
  {
    id: 'ember',
    name: 'Ember',
    css: 'radial-gradient(1000px 700px at 80% 10%, rgba(245,158,11,0.22), transparent 60%), radial-gradient(900px 700px at 15% 85%, rgba(251,113,133,0.16), transparent 60%), linear-gradient(150deg, #0c0a08 0%, #120d0a 60%, #0a0806 100%)',
  },
  {
    id: 'violet',
    name: 'Violet Dream',
    css: 'radial-gradient(1000px 800px at 25% 15%, rgba(167,139,250,0.26), transparent 62%), radial-gradient(900px 700px at 78% 80%, rgba(251,113,133,0.14), transparent 58%), linear-gradient(155deg, #0a0812 0%, #0d0a16 60%, #08060d 100%)',
  },
  {
    id: 'forest',
    name: 'Deep Forest',
    css: 'radial-gradient(1200px 900px at 70% 20%, rgba(16,185,129,0.20), transparent 60%), radial-gradient(800px 600px at 20% 70%, rgba(52,211,153,0.12), transparent 55%), linear-gradient(170deg, #060a08 0%, #081009 55%, #050807 100%)',
  },
  {
    id: 'graphite',
    name: 'Graphite',
    css: 'radial-gradient(1400px 800px at 50% -10%, rgba(255,255,255,0.07), transparent 60%), linear-gradient(180deg, #0b0d10 0%, #0e1114 50%, #0a0c0e 100%)',
  },
  {
    id: 'sunrise',
    name: 'Sunrise',
    css: 'radial-gradient(1100px 700px at 50% 100%, rgba(251,146,60,0.20), transparent 62%), radial-gradient(900px 600px at 15% 15%, rgba(244,114,182,0.14), transparent 58%), linear-gradient(160deg, #0d0a09 0%, #120c0a 55%, #0b0808 100%)',
  },
]

type OSState = {
  bootedOnce: boolean
  windows: WinState[]
  zTop: number
  activeId: string | null
  startOpen: boolean
  fpsOverlay: boolean
  wallpaperId: string
  accentId: string
  powerOff: boolean
  openWindow: (appId: string, props?: WindowProps, title?: string) => string
  closeWindow: (id: string) => void
  focusWindow: (id: string) => void
  minimizeWindow: (id: string) => void
  toggleMinimize: (id: string) => void
  toggleMaximize: (id: string) => void
  setGeometry: (id: string, g: Partial<Pick<WinState, 'x' | 'y' | 'w' | 'h'>>) => void
  setProps: (id: string, props: WindowProps) => void
  setTitle: (id: string, title: string) => void
  setStartOpen: (v: boolean) => void
  setFpsOverlay: (v: boolean) => void
  setWallpaper: (id: string) => void
  setAccent: (id: string) => void
  shutdown: () => void
  reboot: () => void
}

const DEFAULT_SIZES: Record<string, { w: number; h: number }> = {
  terminal: { w: 720, h: 440 },
  browser: { w: 1000, h: 660 },
  tier1: { w: 960, h: 640 },
  files: { w: 880, h: 540 },
  editor: { w: 760, h: 520 },
  monitor: { w: 700, h: 520 },
  settings: { w: 680, h: 460 },
  welcome: { w: 560, h: 430 },
}

const CASCADE = { n: 0 }

export const useOS = create<OSState>()(
  persist(
    (set, get) => ({
      bootedOnce: false,
      windows: [],
      zTop: 10,
      activeId: null,
      startOpen: false,
      fpsOverlay: false,
      wallpaperId: 'aurora',
      accentId: 'emerald',
      powerOff: false,

      openWindow: (appId, props = {}, title) => {
        const id = `${appId}-${Date.now().toString(36)}-${(CASCADE.n++).toString(36)}`
        const size = DEFAULT_SIZES[appId] ?? { w: 640, h: 460 }
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800
        const taskbar = 52
        const w = Math.min(size.w, vw - 24)
        const h = Math.min(size.h, vh - taskbar - 24)
        const baseX = Math.max(12, (vw - w) / 2 - 60 + ((CASCADE.n * 28) % 160))
        const baseY = Math.max(12, (vh - taskbar - h) / 2 - 40 + ((CASCADE.n * 24) % 120))
        const z = ((get().zTop - 10 + 1) % 680) + 10
        const defaultTitles: Record<string, string> = {
          terminal: 'Terminal',
          browser: 'Browser',
          tier1: 'Tier 1 · Memory Training',
          files: 'Files',
          editor: 'Editor',
          monitor: 'System Monitor',
          settings: 'Settings',
          welcome: 'Welcome',
        }
        set((s) => ({
          windows: [
            ...s.windows,
            {
              id,
              appId,
              title: title ?? defaultTitles[appId] ?? appId,
              props,
              x: Math.round(baseX),
              y: Math.round(baseY),
              w,
              h,
              minimized: false,
              z,
              // small screens: open maximized
              maximized: vw < 768,
              restore: vw < 768 ? { x: baseX, y: baseY, w, h } : undefined,
            },
          ],
          zTop: z,
          activeId: id,
          startOpen: false,
        }))
        return id
      },

      closeWindow: (id) =>
        set((s) => ({
          windows: s.windows.filter((w) => w.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
        })),

      focusWindow: (id) =>
        set((s) => {
          // cycle z within a band below the taskbar (z-800) so it never wraps above chrome
          const z = ((s.zTop - 10 + 1) % 680) + 10
          return {
            zTop: z,
            activeId: id,
            startOpen: false,
            windows: s.windows.map((w) =>
              w.id === id ? { ...w, minimized: false, z } : w,
            ),
          }
        }),

      minimizeWindow: (id) =>
        set((s) => ({
          windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)),
          activeId: s.activeId === id ? null : s.activeId,
        })),

      toggleMinimize: (id) => {
        const w = get().windows.find((x) => x.id === id)
        if (!w) return
        if (w.minimized) get().focusWindow(id)
        else if (get().activeId === id) get().minimizeWindow(id)
        else get().focusWindow(id)
      },

      toggleMaximize: (id) =>
        set((s) => ({
          windows: s.windows.map((w) => {
            if (w.id !== id) return w
            if (w.maximized) {
              const r = w.restore ?? { x: 80, y: 60, w: 720, h: 480 }
              return { ...w, maximized: false, ...r }
            }
            return {
              ...w,
              maximized: true,
              restore: { x: w.x, y: w.y, w: w.w, h: w.h },
            }
          }),
        })),

      setGeometry: (id, g) =>
        set((s) => ({
          windows: s.windows.map((w) => (w.id === id ? { ...w, ...g } : w)),
        })),

      setProps: (id, props) =>
        set((s) => ({
          windows: s.windows.map((w) => (w.id === id ? { ...w, props: { ...w.props, ...props } } : w)),
        })),

      setTitle: (id, title) =>
        set((s) => ({
          windows: s.windows.map((w) => (w.id === id ? { ...w, title } : w)),
        })),

      setStartOpen: (v) => set({ startOpen: v }),
      setFpsOverlay: (v) => set({ fpsOverlay: v }),
      setWallpaper: (id) => set({ wallpaperId: id }),
      setAccent: (id) => set({ accentId: id }),
      shutdown: () => set({ powerOff: true, startOpen: false }),
      reboot: () => set({ powerOff: false }),
    }),
    {
      name: 'auraos-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        wallpaperId: s.wallpaperId,
        accentId: s.accentId,
        fpsOverlay: s.fpsOverlay,
        bootedOnce: s.bootedOnce,
      }),
    }
  )
)
