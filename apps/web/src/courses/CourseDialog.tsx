import { useState, type ReactNode } from 'react'
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
}: {
  title: string
  close: () => void
  children: ReactNode
  expandable?: boolean
}) {
  const [full, setFull] = useState(false)
  return (
    <Dialog
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className={
          full
            ? 'h-[calc(100vh-20px)] w-[calc(100vw-20px)] max-w-none sm:max-w-none'
            : 'max-h-[90vh] w-[1000px] overflow-y-auto sm:max-w-[calc(100vw-2rem)] lg:max-w-5xl'
        }
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="pr-8">
          <DialogTitle>{title}</DialogTitle>
          {expandable ? (
            <Button
              size="sm"
              variant="ghost"
              className="w-fit"
              onClick={() => setFull(!full)}
            >
              {full ? '缩小' : '全屏'}
            </Button>
          ) : null}
        </DialogHeader>
        <div className={`min-h-0 ${full ? 'overflow-auto' : ''}`}>
          {children}
        </div>
      </DialogContent>
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
