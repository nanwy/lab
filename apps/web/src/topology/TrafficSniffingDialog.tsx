import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@workspace/ui/components/button'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { toast } from '@workspace/ui/components/sonner'
import { ApiError } from '../api'
import { getTrafficSniffing, setTrafficSniffing } from '../api/traffic-sniffing'
import { usePageSignal } from '../auth/use-page-signal'
import { platformLogoOptions } from '../portal/PlatformBranding'

export function TrafficSniffingDialog({
  id,
  edgeId,
  close,
}: {
  id: string | number
  edgeId: string | number
  close: () => void
}) {
  const [guide, setGuide] = useState(false)
  const [busy, setBusy] = useState(false)
  const pageSignal = usePageSignal()
  const logo = useQuery(platformLogoOptions)
  const status = useQuery({
    queryKey: ['traffic-sniffing', id, edgeId],
    queryFn: ({ signal }) => getTrafficSniffing(id, edgeId, signal),
    retry: false,
    gcTime: 0,
  })
  function report(error: unknown) {
    if (
      !(error instanceof ApiError) ||
      (!error.handled && error.kind !== 'cancelled')
    )
      toast.error(error instanceof Error ? error.message : '流量嗅探操作失败')
  }
  async function toggle() {
    if (!status.data || busy) return
    const signal = pageSignal(),
      start = status.data.status === 1
    setBusy(true)
    try {
      await setTrafficSniffing(id, edgeId, start, signal)
      if (signal.aborted) return
      toast.success(start ? '启动成功！' : '停止成功！')
      await status.refetch()
    } catch (error) {
      report(error)
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent
        className="sm:max-w-3xl"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>流量嗅探</DialogTitle>
          <DialogDescription>
            说明：该方式可以直接启动本地的wireshark工具实时抓取其流量
          </DialogDescription>
        </DialogHeader>
        {status.isPending ? (
          <p role="status">正在读取嗅探状态…</p>
        ) : status.isError ? (
          <p role="alert">{status.error.message}</p>
        ) : (
          <>
            <LoadingButton
              loading={busy}
              disabled={status.isFetching}
              onClick={() => void toggle()}
            >
              {status.data.status === 1 ? '启动' : '停止'}
            </LoadingButton>
            <dl className="grid grid-cols-[6rem_1fr] gap-4">
              <dt>启动命令：</dt>
              <dd>
                {status.data.status === 1 ? (
                  <span>未启动</span>
                ) : (
                  <>
                    <code className="break-all">{status.data.cmd}</code>
                    <Button
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(status.data.cmd ?? '')
                          .then(() => toast.success('复制成功'))
                          .catch(report)
                      }}
                    >
                      复制命令
                    </Button>
                  </>
                )}
              </dd>
              <dt>嗅探状态：</dt>
              <dd>{status.data.status === 1 ? '未启动' : '已启动'}</dd>
            </dl>
          </>
        )}
        <div className="space-y-2">
          <p>使用说明：首次使用时需要完成如下配置</p>
          <p>1、在当前操作终端上，安装wireshark抓包工具</p>
          <p>2、配置系统环境变量，便于wireshark命令行可启动</p>
          <Button variant="outline" onClick={() => setGuide(true)}>
            操作指南
          </Button>
        </div>
        {guide ? (
          <Dialog open onOpenChange={setGuide}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>操作指南</DialogTitle>
                <DialogDescription>Wireshark 安装与配置说明</DialogDescription>
              </DialogHeader>
              <Button
                onClick={() => {
                  const url = logo.data?.onlyoffice_url
                  if (!url) {
                    toast.error('未配置文档预览服务')
                    return
                  }
                  window.open(
                    `${url}/web-apps/?filePath=${window.location.origin}/media/handbook/Wireshark_install.docx&mode=view`,
                    '_blank',
                    'noopener',
                  )
                }}
              >
                打开新窗口预览word文件
              </Button>
            </DialogContent>
          </Dialog>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
