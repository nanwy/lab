import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@workspace/ui/components/button'
import { toast } from '@workspace/ui/components/sonner'
import {
  canEnterNoteCourse,
  type NoteContext,
  type NoteId,
} from '../api/personal-notes'
import { usePageSignal } from '../auth/use-page-signal'
import { reportNoteError } from './NoteDialogs'
declare module '@tanstack/react-router' {
  interface HistoryState {
    section_id?: NoteId
    breakpoint_time?: number
  }
}
export function NoteBreakpoint({
  context,
  note,
}: {
  context: NoteContext
  note: { extend?: unknown; section_id?: NoteId }
}) {
  const navigate = useNavigate()
  const signalForNote = usePageSignal()
  const [busy, setBusy] = useState(false)
  if (note.extend === undefined || note.extend === null) return null
  if (typeof note.extend !== 'object' || Array.isArray(note.extend))
    return <p role="alert">驻点 extend 字段不符合契约</p>
  const value = Reflect.get(note.extend, 'breakpoint_time')
  if (value === undefined || value === '' || value === 0) return null
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    note.section_id === undefined
  )
    return <p role="alert">驻点时间或章节字段不符合契约</p>
  const seconds = Math.floor(value)
  const time = [
    ...(seconds >= 3600
      ? [String(Math.floor(seconds / 3600)).padStart(2, '0')]
      : []),
    String(Math.floor(seconds / 60) % 60).padStart(2, '0'),
    String(seconds % 60).padStart(2, '0'),
  ].join(':')
  async function jump() {
    if (busy) return
    const signal = signalForNote()
    setBusy(true)
    const course = context.type > 4 ? context.folderId : context.courseId
    try {
      const allowed = await canEnterNoteCourse(course, signal)
      if (signal.aborted) return
      if (!allowed) {
        toast.error('该专题已下线，无法查看！')
        return
      }
      await navigate({
        to: '/basic/training/course/$courseId',
        params: { courseId: String(course) },
        state: {
          section_id: note.section_id,
          breakpoint_time: value as number,
        },
      })
    } catch (error) {
      reportNoteError(error, signal)
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => void jump()}
    >
      跳转到驻点 {time}
    </Button>
  )
}
