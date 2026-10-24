import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Switch } from '@workspace/ui/components/switch'
import { toast } from '@workspace/ui/components/sonner'
import { ApiError } from '../api'
import type { NoteId } from '../api/personal-notes'
import { sharePersonalNote } from '../api/shared-notes'
import { validateImageSources } from '../content/html'
export function ShareToggle({
  noteId,
  share,
  content,
  onShared,
  onBusyChange,
  disabled = false,
}: {
  disabled?: boolean
  noteId: NoteId
  share: boolean
  content: string
  onShared: (share: boolean) => void
  onBusyChange?: (busy: boolean) => void
}) {
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const operation = useRef(new AbortController())
  const notifyBusy = useRef(onBusyChange)
  useEffect(() => {
    notifyBusy.current = onBusyChange
  }, [onBusyChange])
  useEffect(() => {
    const controller = new AbortController()
    operation.current = controller
    return () => {
      controller.abort()
      notifyBusy.current?.(false)
    }
  }, [])
  const change = async (next: boolean) => {
    if (busy || disabled) return
    try {
      validateImageSources(content)
      setBusy(true)
      notifyBusy.current?.(true)
      await sharePersonalNote(noteId, next, content, operation.current.signal)
      if (operation.current.signal.aborted) return
      await client.cancelQueries({ queryKey: ['shared-notes'] })
      client.removeQueries({ queryKey: ['shared-notes'] })
      onShared(next)
      await client.invalidateQueries({ queryKey: ['personal-notes'] })
      if (!operation.current.signal.aborted)
        toast.success(next ? '已分享笔记' : '已取消分享')
    } catch (error) {
      if (!(
        error instanceof ApiError &&
        (error.handled || error.kind === 'cancelled')
      ))
        toast.error(error instanceof Error ? error.message : '分享失败')
    } finally {
      if (!operation.current.signal.aborted) {
        setBusy(false)
        notifyBusy.current?.(false)
      }
    }
  }
  return (
    <label className="flex items-center gap-2">
      <Switch
        aria-label="分享笔记"
        checked={share}
        disabled={busy || disabled}
        onCheckedChange={(next) => void change(next)}
      />
      分享笔记
    </label>
  )
}
