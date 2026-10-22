import { lazy, Suspense, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@workspace/ui/components/button'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@workspace/ui/components/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@workspace/ui/components/alert-dialog'
import { toast } from '@workspace/ui/components/sonner'
import { ApiError } from '../api'
import { ActivityTable } from '../activity/ActivityTable'
import { usePageSignal } from '../auth/use-page-signal'
import {
  getOperationMachines,
  allocateOperationMachines,
  updateOperationMachines,
  runOperationMachine,
  type OperationMachine,
} from '../api/operation-machines'
import { desktopHref } from '../api/desktop'
import { textConsoleType, textConsoleHref } from '../api/terminal'

const LazyDesktop = lazy(async () => ({
  default: (await import('./DesktopSession')).DesktopSession,
}))
const statuses = [
  '未启动',
  '启动中',
  '启动成功',
  '启动失败',
  '关机',
  '上传镜像中',
  '暂停',
]
const systems = [
  'Window操作机',
  'Liunx操作机',
  'Unix',
  '开放麒麟',
  '优麒麟',
  '深度',
  '统信',
  'Openeuler',
  'Startos',
]
export function OperationMachines({
  embedded = false,
}: {
  embedded?: boolean
}) {
  const signal = usePageSignal()
  const list = useQuery({
    queryKey: ['operation-machines'],
    queryFn: ({ signal }) => getOperationMachines(signal),
    retry: false,
    gcTime: 0,
  })
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<{
    id: string | number
    type: 'vnc' | 'rdp'
    revision: number
  } | null>(null)
  const [confirmation, setConfirmation] = useState<{
    title: string
    run: () => Promise<unknown>
  } | null>(null)
  function report(error: unknown) {
    if (!(error instanceof ApiError) || !error.handled)
      toast.error(error instanceof Error ? error.message : '操作机操作失败')
  }
  async function run(work: () => Promise<unknown>) {
    setBusy(true)
    try {
      await work()
      if (!signal().aborted) {
        toast.success('操作成功')
        setConfirmation(null)
        await list.refetch()
      }
    } finally {
      if (!signal().aborted) setBusy(false)
    }
  }
  const current = list.data?.find((item) => item.id === selected?.id)
  function connect(machine: OperationMachine, type: 'vnc' | 'rdp') {
    try {
      const connection = machine.web_socker
      if (!connection?.uuid) throw new Error('当前操作机缺少连接标识')
      const text = textConsoleType(connection.type)
      if (type === 'vnc' && text) {
        window.open(
          textConsoleHref(text, connection.uuid),
          '_blank',
          'noopener',
        )
        return
      }
      if (!['libvirt', 'libvirt_middle_intercept'].includes(connection.type))
        throw new Error('当前操作机不支持图形连接')
      if (embedded) setSelected({ id: machine.id, type, revision: 0 })
      else
        window.open(
          desktopHref(type, connection.uuid, machine.name),
          '_blank',
          'noopener',
        )
    } catch (error) {
      report(error)
    }
  }
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">
        {embedded ? '操作机面板' : '虚拟资源'}
      </h2>
      <div className="flex flex-wrap gap-2">
        <LoadingButton
          loading={busy}
          disabled={list.isFetching}
          onClick={() => run(() => allocateOperationMachines(signal()))}
          onError={report}
        >
          分配操作机
        </LoadingButton>
        <Button
          disabled={busy}
          onClick={() =>
            setConfirmation({
              title:
                '更新已有操作机配置，需要手动将所有操作机进行释放，才能进行更新操作！',
              run: () => updateOperationMachines(signal()),
            })
          }
        >
          更新操作机
        </Button>
        <LoadingButton
          loading={list.isFetching}
          disabled={busy}
          onClick={() => list.refetch().then(() => undefined)}
        >
          刷新操作机
        </LoadingButton>
      </div>
      {list.isPending ? (
        <p role="status">正在读取操作机…</p>
      ) : list.isError ? (
        <p role="alert">操作机读取失败</p>
      ) : list.data.length === 0 ? (
        <p>暂未分配操作机</p>
      ) : (
        <ActivityTable
          name="操作机列表"
          empty="暂未分配操作机"
          data={list.data}
          columns={[
            {
              accessorKey: 'name',
              header: '操作机名称',
              cell: ({ row }) =>
                embedded ? (
                  <Button
                    variant="ghost"
                    aria-pressed={selected?.id === row.original.id}
                    onClick={() => {
                      const machine = row.original
                      if (machine.status === 2) connect(machine, 'vnc')
                      else
                        setSelected({
                          id: machine.id,
                          type: 'vnc',
                          revision: 0,
                        })
                    }}
                  >
                    {row.original.name}
                  </Button>
                ) : (
                  row.original.name
                ),
            },
            {
              accessorKey: 'img_type',
              header: '操作机类型',
              cell: ({ row }) =>
                systems[(row.original.img_type ?? 0) - 1] ?? '',
            },
            {
              id: 'config',
              header: '配置',
              cell: ({ row }) =>
                `${row.original.config?.cpu ?? 0}H ${row.original.config?.ram ?? 0}MB ${row.original.config?.disk ?? 0}GB`,
            },
            {
              accessorKey: 'status',
              header: '启动状态',
              cell: ({ row }) => (
                <span
                  title={
                    row.original.status === 3
                      ? (row.original.error_msg ?? '')
                      : undefined
                  }
                >
                  {statuses[row.original.status]}
                </span>
              ),
            },
            {
              accessorKey: 'is_distribute',
              header: '是否分配',
              cell: ({ row }) =>
                row.original.is_distribute ? '已分配' : '未分配',
            },
            { accessorKey: 'float_ip', header: '浮动IP' },
            {
              id: 'login',
              header: '登录说明',
              cell: ({ row }) =>
                [1, 2].includes(row.original.img_type ?? 0) ? (
                  <div className="whitespace-nowrap">
                    <p>
                      账号：
                      {row.original.img_type === 1
                        ? 'administrator'
                        : 'cloversec'}
                    </p>
                    <p>密码：cloversec</p>
                    <p>
                      {row.original.img_type === 1
                        ? '支持远程桌面'
                        : '支持SSH远程连接'}
                    </p>
                  </div>
                ) : null,
            },
            {
              accessorKey: 'create_time',
              header: '创建时间',
              cell: ({ row }) => row.original.create_time ?? '--',
            },
            {
              id: 'actions',
              header: '操作',
              cell: ({ row }) => {
                const machine = row.original
                return (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={busy || machine.status > 0}
                      onClick={() =>
                        setConfirmation({
                          title: '确定启动操作机？',
                          run: () =>
                            runOperationMachine(
                              machine,
                              'start',
                              null,
                              signal(),
                            ),
                        })
                      }
                    >
                      启动
                    </Button>
                    <Button
                      disabled={busy || machine.status !== 2}
                      onClick={() => connect(machine, 'vnc')}
                    >
                      控制台
                    </Button>
                    <Button
                      disabled={
                        busy ||
                        machine.status !== 2 ||
                        !['libvirt', 'libvirt_middle_intercept'].includes(
                          machine.web_socker?.type ?? '',
                        )
                      }
                      onClick={() => connect(machine, 'rdp')}
                    >
                      RDP访问
                    </Button>
                    <Button
                      disabled={busy || machine.status < 1}
                      onClick={() =>
                        setConfirmation({
                          title: '确定释放操作机？操作机将被初始化！',
                          run: () =>
                            runOperationMachine(
                              machine,
                              'release',
                              null,
                              signal(),
                            ),
                        })
                      }
                    >
                      释放
                    </Button>
                  </div>
                )
              },
            },
          ]}
        />
      )}
      {embedded && current && selected ? (
        <div className="space-y-3">
          <h3>{current.name}</h3>
          {current.status === 2 &&
          current.web_socker &&
          ['libvirt', 'libvirt_middle_intercept'].includes(
            current.web_socker.type,
          ) ? (
            <>
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    setSelected({
                      ...selected,
                      revision: selected.revision + 1,
                    })
                  }
                >
                  刷新控制台
                </Button>
                <Button
                  onClick={() =>
                    window.open(
                      `${window.location.pathname}#/mpst/fullscreen/${selected.type}/${encodeURIComponent(current.web_socker!.uuid)}`,
                      '_blank',
                      'noopener',
                    )
                  }
                >
                  全屏
                </Button>
              </div>
              <div className="h-[480px]" id="manipulator-panel">
                <Suspense fallback={<p>正在加载控制台…</p>}>
                  <LazyDesktop
                    key={`${current.id}/${current.web_socker.uuid}/${selected.type}/${selected.revision}`}
                    id={current.web_socker.uuid}
                    type={selected.type}
                    embedded
                  />
                </Suspense>
              </div>
            </>
          ) : (
            <p>{statuses[current.status]}</p>
          )}
        </div>
      ) : null}
      <AlertDialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              此操作影响当前操作机。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <LoadingButton
              loading={busy}
              onClick={() => {
                if (confirmation) return run(confirmation.run)
              }}
              onError={report}
            >
              确认
            </LoadingButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
export function OperationMachinesButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        我的操作机
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>我的操作机</DialogTitle>
            <DialogDescription>选择操作机，连接当前运行会话</DialogDescription>
          </DialogHeader>
          {open ? <OperationMachines embedded /> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
