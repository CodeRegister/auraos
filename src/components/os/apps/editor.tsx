'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Save, Loader2, FileWarning, ImageIcon } from 'lucide-react'
import { apiReadFile, apiWriteFile } from '@/lib/os/api'
import { useOS, type WinState } from '@/lib/os/store'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'

export function EditorApp({ win }: { win: WinState }) {
  const { toast } = useToast()
  const setTitle = useOS((s) => s.setTitle)

  const filePath = (win.props.path as string) || ''
  const name = filePath.split('/').filter(Boolean).pop() || 'untitled'
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'].includes(ext)

  const [content, setContent] = useState('')
  const [original, setOriginal] = useState('')
  const [src, setSrc] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirtyRef = useRef(false)

  useEffect(() => {
    setTitle(win.id, `Editor — ${name}${dirtyRef.current ? ' •' : ''}`)
     
  }, [name])

  const load = useCallback(async () => {
    if (!filePath) {
      setError('No file path given')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await apiReadFile(filePath)
      if (data.binary) {
        setSrc(`data:${(data as { mime?: string }).mime ?? 'application/octet-stream'};base64,${data.content}`)
        setContent('')
        setOriginal('')
      } else {
        setContent(data.content)
        setOriginal(data.content)
        dirtyRef.current = false
        setTitle(win.id, `Editor — ${name}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open file')
    } finally {
      setLoading(false)
    }
  }, [filePath, name, setTitle, win.id])

  useEffect(() => {
    void load()
  }, [load])

  const save = useCallback(async () => {
    if (!filePath || saving) return
    setSaving(true)
    try {
      await apiWriteFile(filePath, content)
      setOriginal(content)
      dirtyRef.current = false
      setTitle(win.id, `Editor — ${name}`)
      toast({ title: 'Saved', description: name })
    } catch (e) {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : 'error', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }, [content, filePath, name, saving, setTitle, toast, win.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save])

  const onChange = (v: string) => {
    setContent(v)
    const dirty = v !== original
    if (dirty !== dirtyRef.current) {
      dirtyRef.current = dirty
      setTitle(win.id, `Editor — ${name}${dirty ? ' •' : ''}`)
    }
  }

  return (
    <div className="h-full w-full flex flex-col bg-[#0d1117]">
      {/* toolbar */}
      <div className="h-9 shrink-0 flex items-center gap-2 px-3 border-b border-white/10 bg-white/[0.03]">
        <span className="text-xs text-zinc-400 truncate flex-1">{filePath || 'untitled'}</span>
        {!isImage && !loading && !error && content !== original && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
            unsaved
          </span>
        )}
        {!isImage && !loading && !error && (
          <span className="text-[10px] text-zinc-500 hidden md:inline">{content.split('\n').length} lines · {content.length} chars</span>
        )}
        {!isImage && !loading && !error && (
          <Button size="sm" className="h-6 text-xs px-2.5" style={{ background: 'var(--os-accent)' }} onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
            Save
          </Button>
        )}
      </div>

      {/* body */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-zinc-500 px-6 text-center">
          <FileWarning className="w-8 h-8 opacity-50" />
          <p className="text-sm text-zinc-400">{error}</p>
          <p className="text-[11px] text-zinc-600 break-all">{filePath}</p>
        </div>
      ) : isImage ? (
        <div className="flex-1 overflow-auto os-scroll flex items-center justify-center p-4 bg-[repeating-conic-gradient(#1a1f27_0%_25%,#12161d_0%_50%)] bg-[length:20px_20px]">
          { }
          <img src={src} alt={name} className="max-w-full max-h-full object-contain rounded shadow-lg" />
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="flex-1 w-full resize-none bg-transparent outline-none border-none font-mono text-[12.5px] leading-relaxed text-zinc-200 p-3 os-scroll"
          aria-label={`Editing ${name}`}
        />
      )}
      {!isImage && !loading && !error && (
        <div className="h-5 shrink-0 border-t border-white/10 px-3 flex items-center text-[10px] text-zinc-600">
          <span>Ctrl+S to save{ext ? ` · ${ext.toUpperCase()}` : ''}</span>
          <span className="ml-auto flex items-center gap-1">
            <ImageIcon className="w-2.5 h-2.5 opacity-40" /> plain text editor
          </span>
        </div>
      )}
    </div>
  )
}
