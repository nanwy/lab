import Draggable, { type DraggableBounds } from 'react-draggable'
import { useRef, useState, type ReactNode } from 'react'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'

export function CourseDialog({
  title,
  close,
  children,
  expandable = false,
  draggable = false,
}: {
  title: string
  close: () => void
  children: ReactNode
  draggable?: boolean
  expandable?: boolean
}) {
  const [full, setFull] = useState(false)
  const nodeRef = useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = useState<DraggableBounds>()
  const [position, setPosition] = useState({ x: 0, y: 0 })
  return (
    <Dialog
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <Draggable
        nodeRef={nodeRef}
        handle=".course-dialog-handle"
        cancel="button"
        disabled={!draggable || full}
        position={position}
        bounds={bounds}
        onStart={(_, data) => {
          const rect = nodeRef.current?.getBoundingClientRect()
          if (!rect) return false
          const viewport = document.documentElement
          setBounds({
            left: data.x - rect.left,
            right: viewport.clientWidth - rect.right + data.x,
            top: data.y - rect.top,
            bottom: viewport.clientHeight - rect.bottom + data.y,
          })
        }}
        onStop={(_, data) => setPosition({ x: data.x, y: data.y })}
        positionOffset={{ x: '-50%', y: '-50%' }}
      >
        <DialogContent
          ref={nodeRef}
          aria-describedby={undefined}
          className={
            full
              ? 'translate-x-0 translate-y-0 h-[calc(100vh-20px)] w-[calc(100vw-20px)] max-w-none sm:max-w-none'
              : 'translate-x-0 translate-y-0 max-h-[90vh] w-[1000px] overflow-y-auto sm:max-w-[calc(100vw-2rem)] lg:max-w-5xl'
          }
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader
            className={`course-dialog-handle pr-8 ${draggable && !full ? 'cursor-move' : ''}`}
          >
            <DialogTitle>{title}</DialogTitle>
            {expandable ? (
              <Button
                size="sm"
                variant="ghost"
                className="w-fit"
                onClick={() => {
                  setPosition({ x: 0, y: 0 })
                  setFull(!full)
                }}
              >
                {full ? '缩小' : '全屏'}
              </Button>
            ) : null}
          </DialogHeader>
          <div className={`min-h-0 ${full ? 'overflow-auto' : ''}`}>
            {children}
          </div>
        </DialogContent>
      </Draggable>
    </Dialog>
  )
}
export function CourseMediaDialog({
  title,
  src,
  kind,
  close,
}: {
  title: string
  src: string
  kind: 'video' | 'lecture'
  close: () => void
}) {
  return (
    <CourseDialog title={title} close={close} expandable={kind === 'lecture'}>
      {kind === 'video' ? (
        <video
          className="h-[490px] max-h-[70vh] w-full"
          src={src}
          controls
          preload="metadata"
        />
      ) : (
        <iframe className="h-[70vh] w-full border-0" title={title} src={src} />
      )}
    </CourseDialog>
  )
}
