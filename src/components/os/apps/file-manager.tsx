'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, ArrowUp, RefreshCw, Search, FolderPlus, FilePlus2, TerminalSquare,
  Folder, FileText, Image as ImageIcon, File as FileIcon, Eye, EyeOff, LayoutGrid, List as ListIcon,
  Trash2, Pencil, RotateCcw, HardDrive,
} from 'lucide-react'
import { apiList, apiOp, type FsEntry } from '@/lib/os/api'
import { useOS, type WinState } from '@/lib/os/store'
import { useToast } from '@/hooks/use-toast'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function fmtDate(ms: number) {
  const d = new Date(ms)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function joinPath(dir: string, name: string) {
  return dir === '/' ? `/${name}` : `${dir}/${name}`
}

function basename(p: string) {
  return p.split('/').filter(Boolean).pop() || '/'
}

type CtxMenu = { x: number; y: number; entry: FsEntry | null } | null

export function FileManagerApp({ win }: { win: WinState }) {
  const { toast } = useToast()
  const openWindow = useOS((s) => s.openWindow)
  const setProps = useOS((s) => s.setProps)

  const [path, setPath] = useState<string>((win.props.path as string) || '')
  const [home, setHome] = useState<string>('')
  const [entries, setEntries] = useState<FsEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [backStack, setBackStack] = useState<string[]>([])
  const [fwdStack, setFwdStack] = useState<string[]>([])
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [creating, setCreating] = useState<'dir' | 'file' | null>(null)
  const [createValue, setCreateValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null)
  const [ctx, setCtx] = useState<CtxMenu>(null)
  const createInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(
    async (p: string) => {
      setLoading(true)
      setError(null)
      try {
        const data = await apiList(p)
        setPath(data.path)
        setEntries(data.entries)
        if (!home) setHome(data.path)
        setProps(win.id, { path: data.path })
        setSelected(new Set())
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load folder')
        setEntries([])
      } finally {
        setLoading(false)
      }
    },
    [home, setProps, win.id]
  )

  useEffect(() => {
    void load((win.props.path as string) || '')
    // desktop context menu may ask for an immediate create dialog
    if (win.props.newFolder) setTimeout(() => startCreateRef.current('dir'), 400)
    if (win.props.newFile) setTimeout(() => startCreateRef.current('file'), 400)
     
  }, [])

  const navigate = useCallback(
    (p: string) => {
      if (p === path) return
      setBackStack((b) => [...b, path])
      setFwdStack([])
      void load(p)
    },
    [path, load]
  )

  const goBack = () => {
    if (!backStack.length) return
    const prev = backStack[backStack.length - 1]
    setBackStack((b) => b.slice(0, -1))
    setFwdStack((f) => [...f, path])
    void load(prev)
  }
  const goForward = () => {
    if (!fwdStack.length) return
    const next = fwdStack[fwdStack.length - 1]
    setFwdStack((f) => f.slice(0, -1))
    setBackStack((b) => [...b, path])
    void load(next)
  }
  const goUp = () => {
    if (!path) return
    const up = path.split('/').slice(0, -1).join('/') || '/'
    if (up !== path) navigate(up)
  }

  const visible = useMemo(() => {
    const filtered = entries.filter((e) => (showHidden || !e.hidden) && (!query || e.name.toLowerCase().includes(query.toLowerCase())))
    return filtered.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
  }, [entries, showHidden, query])

  const openEntry = (e: FsEntry) => {
    const full = joinPath(path, e.name)
    if (e.type === 'directory') navigate(full)
    else openWindow('editor', { path: full }, `Editor — ${e.name}`)
  }

  const doCreate = async () => {
    if (!creating) return
    const name = createValue.trim()
    if (!name) {
      setCreating(null)
      return
    }
    try {
      await apiOp({ action: creating === 'dir' ? 'mkdir' : 'touch', path, name })
      toast({ title: creating === 'dir' ? 'Folder created' : 'File created', description: name })
      await load(path)
    } catch (e) {
      toast({ title: 'Create failed', description: e instanceof Error ? e.message : 'error', variant: 'destructive' })
    } finally {
      setCreating(null)
      setCreateValue('')
    }
  }

  const doRename = async () => {
    const oldName = renaming
    const newName = renameValue.trim()
    setRenaming(null)
    if (!oldName || !newName || newName === oldName) return
    try {
      await apiOp({ action: 'rename', path, name: oldName, newName })
      toast({ title: 'Renamed', description: `${oldName} → ${newName}` })
      await load(path)
    } catch (e) {
      toast({ title: 'Rename failed', description: e instanceof Error ? e.message : 'error', variant: 'destructive' })
    }
  }

  const doDelete = async (names: string[]) => {
    try {
      await apiOp({ action: 'delete', path, names })
      toast({ title: names.length === 1 ? 'Deleted' : `Deleted ${names.length} items`, description: names.join(', ') })
      await load(path)
    } catch (e) {
      toast({ title: 'Delete failed', description: e instanceof Error ? e.message : 'error', variant: 'destructive' })
    }
  }

  useEffect(() => {
    if (creating) createInputRef.current?.focus()
  }, [creating])

  const selSize = useMemo(
    () => visible.filter((e) => selected.has(e.name)).reduce((acc, e) => acc + e.size, 0),
    [visible, selected]
  )

  const places = useMemo(() => {
    if (!home) return []
    return [
      { name: 'Home', path: home, icon: HardDrive },
      { name: 'Project', path: joinPath(home, 'my-project'), icon: Folder },
      { name: 'Uploads', path: joinPath(home, 'my-project/upload'), icon: Folder },
      { name: 'Downloads', path: joinPath(home, 'my-project/download'), icon: Folder },
      { name: 'Scripts', path: joinPath(home, 'my-project/scripts'), icon: Folder },
    ]
  }, [home])

  const closeCtx = useCallback(() => setCtx(null), [])
  useEffect(() => {
    if (ctx) {
      window.addEventListener('click', closeCtx)
      window.addEventListener('resize', closeCtx)
      return () => {
        window.removeEventListener('click', closeCtx)
        window.removeEventListener('resize', closeCtx)
      }
    }
  }, [ctx, closeCtx])

  const crumbs = useMemo(() => {
    if (!path) return []
    const parts = path.split('/').filter(Boolean)
    const acc: { name: string; path: string }[] = [{ name: '/', path: '/' }]
    let cur = ''
    for (const p of parts) {
      cur += '/' + p
      acc.push({ name: p, path: cur })
    }
    return acc
  }, [path])

  const startCreate = (kind: 'dir' | 'file') => {
    setCreating(kind)
    setCreateValue(kind === 'dir' ? 'New Folder' : 'untitled.txt')
    setSelected(new Set())
  }
  const startCreateRef = useRef(startCreate)
  startCreateRef.current = startCreate

  const IconFor = (e: FsEntry) =>
    e.type === 'directory' ? (
      <Folder className="w-5 h-5" style={{ color: 'var(--os-accent)' }} fill="currentColor" fillOpacity={0.25} />
    ) : IMAGE_EXTS.has(e.ext) ? (
      <ImageIcon className="w-5 h-5 text-teal-300" />
    ) : e.ext || e.name.match(/\.(txt|md)$/) ? (
      <FileText className="w-5 h-5 text-zinc-400" />
    ) : (
      <FileIcon className="w-5 h-5 text-zinc-500" />
    )

  return (
    <div className="h-full w-full flex flex-col bg-[#0d1117] text-zinc-200" onClick={closeCtx}>
      {/* toolbar */}
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-white/10 shrink-0 flex-wrap">
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Back" disabled={!backStack.length} onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Forward" disabled={!fwdStack.length} onClick={goForward}>
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Up" disabled={!path} onClick={goUp}>
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Refresh" onClick={() => void load(path)}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        {/* breadcrumbs */}
        <div className="flex-1 min-w-[140px] h-7 rounded-md bg-white/5 border border-white/10 px-2 flex items-center gap-0.5 overflow-x-auto os-scroll-x">
          {crumbs.map((c, i) => (
            <React.Fragment key={c.path}>
              {i > 0 && <span className="text-zinc-600 text-xs px-0.5">/</span>}
              <button
                className="text-xs px-1 py-0.5 rounded hover:bg-white/10 whitespace-nowrap text-zinc-300"
                onClick={() => navigate(c.path)}
              >
                {c.name}
              </button>
            </React.Fragment>
          ))}
          {loading && <span className="text-xs text-zinc-500 px-2 animate-pulse">loading…</span>}
        </div>
        <div className="relative w-32 md:w-44">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter…"
            className="h-7 pl-7 text-xs bg-white/5 border-white/10"
            aria-label="Filter files"
          />
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="New folder" title="New folder" onClick={() => startCreate('dir')}>
          <FolderPlus className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="New file" title="New file" onClick={() => startCreate('file')}>
          <FilePlus2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Open terminal here"
          title="Open terminal here"
          onClick={() => openWindow('terminal', { cwd: path })}
        >
          <TerminalSquare className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={showHidden ? 'Hide hidden files' : 'Show hidden files'}
          title="Toggle hidden files"
          onClick={() => setShowHidden((v) => !v)}
        >
          {showHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Toggle view"
          title="Toggle grid/list"
          onClick={() => setView((v) => (v === 'grid' ? 'list' : 'grid'))}
        >
          {view === 'grid' ? <ListIcon className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
        </Button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* sidebar */}
        <div className="w-36 md:w-44 shrink-0 border-r border-white/10 py-2 px-1.5 overflow-y-auto os-scroll hidden sm:block">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 px-2 py-1">Places</div>
          {places.map((p) => (
            <button
              key={p.path}
              onClick={() => navigate(p.path)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-white/10 transition-colors ${
                path === p.path ? 'bg-white/10 text-zinc-100' : 'text-zinc-300'
              }`}
            >
              <p.icon className="w-3.5 h-3.5 shrink-0" style={{ color: path === p.path ? 'var(--os-accent)' : undefined }} />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 px-2 py-1 mt-3">Storage</div>
          <div className="px-2 text-[11px] text-zinc-500">
            Sandbox workspace
            <br />
            {path || '…'}
          </div>
        </div>

        {/* main area */}
        <div
          className="flex-1 min-h-0 overflow-y-auto os-scroll p-2 relative"
          onContextMenu={(e) => {
            e.preventDefault()
            setCtx({ x: e.clientX, y: e.clientY, entry: null })
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelected(new Set())
          }}
        >
          {error ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-500">
              <Folder className="w-10 h-10 opacity-40" />
              <p className="text-sm">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void load(path || '')}>
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Retry
              </Button>
            </div>
          ) : loading && !entries.length ? (
            <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-20 rounded-lg bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : !visible.length ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-zinc-600">
              <Folder className="w-10 h-10 opacity-40" />
              <p className="text-sm">{query ? 'No matches' : showHidden ? 'Folder is empty' : 'Folder is empty (hidden files not shown)'}</p>
            </div>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
              {visible.map((e) => (
                <GridItem
                  key={e.name}
                  entry={e}
                  selected={selected.has(e.name)}
                  renaming={renaming === e.name}
                  renameValue={renameValue}
                  setRenameValue={setRenameValue}
                  commitRename={doRename}
                  cancelRename={() => setRenaming(null)}
                  onSelect={( additive) => {
                    setSelected((prev) => {
                      const next = additive ? new Set(prev) : new Set<string>()
                      if (additive && prev.has(e.name)) next.delete(e.name)
                      else next.add(e.name)
                      return next
                    })
                  }}
                  onOpen={() => openEntry(e)}
                  onContext={(x, y) => {
                    setSelected(new Set([e.name]))
                    setCtx({ x, y, entry: e })
                  }}
                />
              ))}
              {creating && (
                <div className="rounded-lg p-2 flex flex-col items-center gap-1.5 bg-white/5 border border-dashed border-white/20">
                  {creating === 'dir' ? <Folder className="w-8 h-8 text-zinc-500" /> : <FileText className="w-8 h-8 text-zinc-500" />}
                  <Input
                    ref={createInputRef}
                    value={createValue}
                    onChange={(e) => setCreateValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void doCreate()
                      if (e.key === 'Escape') {
                        setCreating(null)
                        setCreateValue('')
                      }
                    }}
                    onBlur={() => void doCreate()}
                    className="h-6 text-[11px] px-1 bg-black/40 border-white/20"
                    aria-label="New item name"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="min-w-[420px]">
              <div className="grid grid-cols-[1fr_88px_110px] gap-2 px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500 border-b border-white/5">
                <span>Name</span>
                <span>Size</span>
                <span>Modified</span>
              </div>
              {visible.map((e) => (
                <ListItem
                  key={e.name}
                  entry={e}
                  selected={selected.has(e.name)}
                  renaming={renaming === e.name}
                  renameValue={renameValue}
                  setRenameValue={setRenameValue}
                  commitRename={doRename}
                  cancelRename={() => setRenaming(null)}
                  onSelect={(additive) => {
                    setSelected((prev) => {
                      const next = additive ? new Set(prev) : new Set<string>()
                      if (additive && prev.has(e.name)) next.delete(e.name)
                      else next.add(e.name)
                      return next
                    })
                  }}
                  onOpen={() => openEntry(e)}
                  onContext={(x, y) => {
                    setSelected(new Set([e.name]))
                    setCtx({ x, y, entry: e })
                  }}
                  iconFor={IconFor}
                />
              ))}
              {creating && (
                <div className="grid grid-cols-[1fr_88px_110px] gap-2 px-2 py-1.5 items-center text-xs rounded-md bg-white/5 border border-dashed border-white/20">
                  <div className="flex items-center gap-2">
                    {creating === 'dir' ? <Folder className="w-4 h-4 text-zinc-500" /> : <FileText className="w-4 h-4 text-zinc-500" />}
                    <Input
                      ref={createInputRef}
                      value={createValue}
                      onChange={(e) => setCreateValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void doCreate()
                        if (e.key === 'Escape') {
                          setCreating(null)
                          setCreateValue('')
                        }
                      }}
                      onBlur={() => void doCreate()}
                      className="h-6 text-xs px-1 bg-black/40 border-white/20"
                      aria-label="New item name"
                    />
                  </div>
                  <span />
                  <span />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* status bar */}
      <div className="h-6 shrink-0 border-t border-white/10 px-3 flex items-center gap-3 text-[11px] text-zinc-500">
        <span>{visible.length} items</span>
        {selected.size > 0 && (
          <span>
            · {selected.size} selected{selSize > 0 ? ` (${fmtSize(selSize)})` : ''}
          </span>
        )}
        <span className="ml-auto truncate hidden md:inline">{path}</span>
      </div>

      {/* context menu */}
      {ctx && (
        <div
          className="fixed z-[10000] min-w-44 rounded-lg border border-white/15 bg-[#161b22]/95 backdrop-blur-md shadow-2xl py-1 text-xs"
          style={{ left: Math.min(ctx.x, (typeof window !== 'undefined' ? window.innerWidth : 800) - 190), top: Math.min(ctx.y, (typeof window !== 'undefined' ? window.innerHeight : 600) - 220) }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctx.entry ? (
            <>
              <CtxItem label="Open" onClick={() => { openEntry(ctx.entry!); setCtx(null) }} />
              {ctx.entry.type === 'directory' && (
                <CtxItem label="Open in Terminal" icon={<TerminalSquare className="w-3.5 h-3.5" />} onClick={() => { openWindow('terminal', { cwd: joinPath(path, ctx.entry!.name) }); setCtx(null) }} />
              )}
              <CtxItem label="Rename" icon={<Pencil className="w-3.5 h-3.5" />} onClick={() => { setRenaming(ctx.entry!.name); setRenameValue(ctx.entry!.name); setCtx(null) }} />
              <CtxItem
                label="Delete"
                icon={<Trash2 className="w-3.5 h-3.5" />}
                danger
                onClick={() => { setConfirmDelete([ctx.entry!.name]); setCtx(null) }}
              />
            </>
          ) : (
            <>
              <CtxItem label="New Folder" icon={<FolderPlus className="w-3.5 h-3.5" />} onClick={() => { setCtx(null); startCreate('dir') }} />
              <CtxItem label="New File" icon={<FilePlus2 className="w-3.5 h-3.5" />} onClick={() => { setCtx(null); startCreate('file') }} />
              <div className="my-1 h-px bg-white/10" />
              <CtxItem label="Open Terminal Here" icon={<TerminalSquare className="w-3.5 h-3.5" />} onClick={() => { openWindow('terminal', { cwd: path }); setCtx(null) }} />
              <CtxItem label="Refresh" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => { void load(path); setCtx(null) }} />
            </>
          )}
        </div>
      )}

      {/* delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent className="bg-[#161b22] border-white/15 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.length === 1 ? `"${basename(confirmDelete[0])}"` : `${confirmDelete?.length} items`}?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This permanently removes {confirmDelete?.length === 1 ? 'this item' : 'these items'} from the sandbox
              {confirmDelete?.some((n) => !n.startsWith('.')) ? ', including folder contents' : ''}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent text-zinc-300 border-white/15 hover:bg-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (confirmDelete) void doDelete(confirmDelete)
                setConfirmDelete(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CtxItem({
  label, icon, onClick, danger,
}: { label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 ${
        danger ? 'text-red-400' : 'text-zinc-200'
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  )
}

type ItemProps = {
  entry: FsEntry
  selected: boolean
  renaming: boolean
  renameValue: string
  setRenameValue: (v: string) => void
  commitRename: () => void
  cancelRename: () => void
  onSelect: (additive: boolean) => void
  onOpen: () => void
  onContext: (x: number, y: number) => void
}

function GridItem(p: ItemProps) {
  const { entry: e } = p
  return (
    <button
      className={`group rounded-lg p-2 flex flex-col items-center gap-1.5 text-center transition-colors ${
        p.selected ? 'bg-white/15 ring-1 ring-white/25' : 'hover:bg-white/8'
      }`}
      onClick={(ev) => p.onSelect(ev.ctrlKey || ev.metaKey || ev.shiftKey)}
      onDoubleClick={p.onOpen}
      onContextMenu={(ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        p.onContext(ev.clientX, ev.clientY)
      }}
      aria-label={e.name}
    >
      {e.type === 'directory' ? (
        <Folder className="w-9 h-9" style={{ color: 'var(--os-accent)' }} fill="currentColor" fillOpacity={0.22} />
      ) : IMAGE_EXTS.has(e.ext) ? (
        <ImageIcon className="w-9 h-9 text-teal-300" />
      ) : e.ext ? (
        <FileText className="w-9 h-9 text-zinc-400" />
      ) : (
        <FileIcon className="w-9 h-9 text-zinc-500" />
      )}
      {p.renaming ? (
        <input
          autoFocus
          value={p.renameValue}
          onChange={(ev) => p.setRenameValue(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') p.commitRename()
            if (ev.key === 'Escape') p.cancelRename()
          }}
          onBlur={p.commitRename}
          className="w-full h-5 text-[11px] px-1 rounded bg-black/50 border border-white/25 outline-none"
          onClick={(ev) => ev.stopPropagation()}
          aria-label="Rename"
        />
      ) : (
        <span className="text-[11px] leading-tight text-zinc-300 break-all line-clamp-2 w-full">{e.name}</span>
      )}
    </button>
  )
}

function ListItem(p: ItemProps & { iconFor: (e: FsEntry) => React.ReactNode }) {
  const { entry: e } = p
  return (
    <div
      className={`grid grid-cols-[1fr_88px_110px] gap-2 px-2 py-1.5 items-center text-xs rounded-md cursor-default ${
        p.selected ? 'bg-white/15' : 'hover:bg-white/8'
      }`}
      onClick={(ev) => p.onSelect(ev.ctrlKey || ev.metaKey || ev.shiftKey)}
      onDoubleClick={p.onOpen}
      onContextMenu={(ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        p.onContext(ev.clientX, ev.clientY)
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {p.iconFor(e)}
        {p.renaming ? (
          <input
            autoFocus
            value={p.renameValue}
            onChange={(ev) => p.setRenameValue(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') p.commitRename()
              if (ev.key === 'Escape') p.cancelRename()
            }}
            onBlur={p.commitRename}
            className="flex-1 h-5 text-xs px-1 rounded bg-black/50 border border-white/25 outline-none"
            onClick={(ev) => ev.stopPropagation()}
            aria-label="Rename"
          />
        ) : (
          <span className="truncate text-zinc-300">{e.name}</span>
        )}
      </div>
      <span className="text-zinc-500">{e.type === 'file' ? fmtSize(e.size) : '—'}</span>
      <span className="text-zinc-500">{fmtDate(e.mtime)}</span>
    </div>
  )
}
