'use client'

import React from 'react'
import {
  SquareTerminal, Folder, FileText, Activity, Settings, Sparkles, type LucideIcon,
} from 'lucide-react'
import type { WinState } from '@/lib/os/store'
import { TerminalApp } from './apps/terminal'
import { FileManagerApp } from './apps/file-manager'
import { EditorApp } from './apps/editor'
import { MonitorApp } from './apps/monitor'
import { SettingsApp } from './apps/settings'
import { WelcomeApp } from './apps/welcome'

export type AppMeta = {
  id: string
  name: string
  description: string
  icon: LucideIcon
}

export const APPS: AppMeta[] = [
  { id: 'files', name: 'Files', description: 'Browse and manage folders', icon: Folder },
  { id: 'terminal', name: 'Terminal', description: 'Real bash shell', icon: SquareTerminal },
  { id: 'editor', name: 'Editor', description: 'View and edit files', icon: FileText },
  { id: 'monitor', name: 'System Monitor', description: 'CPU, memory, FPS', icon: Activity },
  { id: 'settings', name: 'Settings', description: 'Personalize your desktop', icon: Settings },
  { id: 'welcome', name: 'Welcome', description: 'Quick tour & tips', icon: Sparkles },
]

export function AppIcon({ appId, className }: { appId: string; className?: string }) {
  const meta = APPS.find((a) => a.id === appId)
  const Icon = meta?.icon ?? Sparkles
  return <Icon className={className} />
}

export function AppHost({ win }: { win: WinState }) {
  switch (win.appId) {
    case 'terminal':
      return <TerminalApp win={win} />
    case 'files':
      return <FileManagerApp win={win} />
    case 'editor':
      return <EditorApp win={win} />
    case 'monitor':
      return <MonitorApp win={win} />
    case 'settings':
      return <SettingsApp win={win} />
    case 'welcome':
      return <WelcomeApp win={win} />
    default:
      return (
        <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
          Unknown app: {win.appId}
        </div>
      )
  }
}
