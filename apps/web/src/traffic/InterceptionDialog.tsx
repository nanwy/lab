import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@workspace/ui/components/dialog'
import { Button } from '@workspace/ui/components/button'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { toast } from '@workspace/ui/components/sonner'
import {
  getInterception,
  getInterceptionProtocols,
  saveInterception,
  closeInterception,
  type InterceptionDraft,
} from '../api/traffic-interception'
import { subscribeInterceptionLog } from '../api/interception-log'
import { usePageSignal } from '../auth/use-page-signal'
import { ApiError } from '../api'
import { captureError } from './CaptureRecords'
import {
  InterceptionTemplates,
  SaveInterceptionAs,
} from './InterceptionTemplates'
import { InterceptionFields } from './InterceptionFields'

export function InterceptionDialog({
  id,
  uuid,
  close,
}: {
  id: string | number
  uuid: string
  close: () => void
}) {
  const [applied, setApplied] = useState<{
    draft: InterceptionDraft
    dirty: boolean
  } | null>(null)
  const [tab, setTab] = useState<'node' | 'templates'>('node')
  const [logs, setLogs] = useState<string[]>([])
  const [logTab, setLogTab] = useState(false)
  const info = useQuery({
    queryKey: ['interception', id, uuid],
    queryFn: ({ signal }) => getInterception(id, uuid, signal),
    retry: false,
  })
  const protocols = useQuery({
    queryKey: ['interception-protocols'],
    queryFn: ({ signal }) => getInterceptionProtocols(signal),
    retry: false,
  })
  useEffect(() => {
    if (tab === 'node' && info.data?.cid)
      return subscribeInterceptionLog(
        info.data.cid,
        (line) => setLogs((current) => [...current, line]),
        captureError,
      )
  }, [tab, info.data?.cid])
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-auto sm:max-w-5xl"
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>拦截修改</DialogTitle>
          <DialogDescription>节点流量拦截策略与模板</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button onClick={() => setTab('node')}>拦截修改</Button>
          <Button onClick={() => setTab('templates')}>拦截模板</Button>
        </div>
        {protocols.isError &&
          !(protocols.error instanceof ApiError && protocols.error.handled) && (
            <p role="alert">协议列表读取失败：{protocols.error.message}</p>
          )}
        {info.isPending ? (
          <p role="status">正在加载拦截配置…</p>
        ) : info.isError ? (
          <p role="alert">{info.error.message}</p>
        ) : tab === 'node' ? (
          <div>
            <NodeInterception
              key={`${id}:${uuid}:${info.dataUpdatedAt}`}
              id={id}
              uuid={uuid}
              initial={applied?.draft ?? info.data.draft}
              initiallyDirty={applied?.dirty ?? false}
              buffer={(draft, dirty) => setApplied({ draft, dirty })}
              cid={info.data.cid}
              running={info.data.running}
              protocols={protocols.data ?? []}
              logs={logs}
              clearLogs={() => setLogs([])}
              logTab={logTab}
              setLogTab={setLogTab}
              refresh={async () => {
                setApplied(null)
                return info.refetch()
              }}
            />
          </div>
        ) : null}
        {tab === 'templates' && (
          <InterceptionTemplates
            protocols={protocols.data ?? []}
            running={info.data?.running ?? false}
            apply={(value) => setApplied({ draft: value, dirty: true })}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
function NodeInterception({
  id,
  uuid,
  initial,
  initiallyDirty,
  buffer,
  cid,
  running,
  protocols,
  logs,
  clearLogs,
  logTab,
  setLogTab,
  refresh,
}: {
  id: string | number
  uuid: string
  initial: InterceptionDraft
  initiallyDirty: boolean
  buffer: (draft: InterceptionDraft, dirty: boolean) => void
  cid?: string | number | null
  running: boolean
  protocols: string[]
  logs: string[]
  clearLogs: () => void
  logTab: boolean
  setLogTab: (value: boolean) => void
  refresh: () => Promise<unknown>
}) {
  const [dirty, setDirty] = useState(initiallyDirty)
  const [saveAs, setSaveAs] = useState<InterceptionDraft | null>(null)
  const signal = usePageSignal()
  async function start(value: InterceptionDraft, validate: () => boolean) {
    if (dirty) {
      toast.warning('存在未保存更改，请先保存修改')
      return
    }
    if (!validate()) return
    await saveInterception(id, uuid, value, true, signal())
    if (!signal().aborted) {
      toast.success('启动成功')
      await refresh()
    }
  }
  return (
    <>
      <p>启动状态：{running ? '运行中' : '未启动'}</p>
      {running && <p>运行中禁止修改拦截模板</p>}
      <div className="flex gap-2">
        <Button onClick={() => setLogTab(false)}>拦截代码</Button>
        <Button onClick={() => setLogTab(true)}>拦截日志</Button>
      </div>
      {logTab && (
        <div>
          {cid ? (
            <>
              <Button variant="destructive" onClick={clearLogs}>
                清空日志
              </Button>
              <div
                className="h-[350px] overflow-y-auto bg-black p-3 text-white"
                aria-label="拦截日志内容"
              >
                {logs.map((line, index) => (
                  <div key={index}>{line}</div>
                ))}
              </div>
            </>
          ) : (
            <p>未启动</p>
          )}
        </div>
      )}
      <InterceptionFields
        showCode={!logTab}
        draft={initial}
        protocols={protocols}
        locked={running}
        submitLabel="保存"
        disabled={!dirty}
        change={(draft) => {
          setDirty(true)
          buffer(draft, true)
        }}
        submit={async (value) => {
          try {
            await saveInterception(id, uuid, value, false, signal())
            if (!signal().aborted) {
              setDirty(false)
              buffer(value, false)
              toast.success('保存成功')
            }
          } catch (error) {
            captureError(error)
          }
        }}
        footer={(value, validate) => (
          <>
            {
              <Button
                type="button"
                onClick={() => {
                  if (validate()) setSaveAs(value)
                }}
              >
                另存为模板
              </Button>
            }
            {running ? (
              <LoadingButton
                variant="destructive"
                onError={captureError}
                onClick={async () => {
                  await closeInterception(id, uuid, signal())
                  if (!signal().aborted) await refresh()
                }}
              >
                暂停
              </LoadingButton>
            ) : (
              <LoadingButton
                onError={captureError}
                onClick={() => start(value, validate)}
              >
                启动
              </LoadingButton>
            )}
          </>
        )}
      />
      {saveAs && (
        <SaveInterceptionAs draft={saveAs} close={() => setSaveAs(null)} />
      )}
    </>
  )
}
