import { useState } from 'react'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { toast } from '@workspace/ui/components/sonner'
import { ApiError } from '../api'
import { exportFiles, type FileScope } from '../api/files'
import { usePageSignal } from '../auth/use-page-signal'
import type { FileActionsContext } from './FileDrivePage'

export function FileExportButton({
  scope,
  context,
}: {
  scope: FileScope
  context: FileActionsContext
}) {
  const [pending, setPending] = useState(false)
  const signalForPage = usePageSignal()
  async function start() {
    if (pending) return
    const signal = signalForPage()
    setPending(true)
    try {
      const address = await exportFiles(
        scope,
        context.selected.map((file) => file.id),
        signal,
      )
      if (signal.aborted) return
      const link = document.createElement('a')
      link.href = address
      link.download = 'download.zip'
      document.body.append(link)
      link.click()
      link.remove()
      toast.success('下载开始')
    } catch (error) {
      if (!signal.aborted && (!(error instanceof ApiError) || !error.handled))
        toast.error(error instanceof Error ? error.message : '打包失败，请重试')
    } finally {
      if (!signal.aborted) setPending(false)
    }
  }
  return (
    <LoadingButton
      variant="outline"
      loading={pending}
      disabled={!context.selected.length}
      onClick={() => void start()}
    >
      {scope === 'public' ? '打包下载' : '批量导出'}
    </LoadingButton>
  )
}
