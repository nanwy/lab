import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogFooter,
} from '@workspace/ui/components/alert-dialog'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { toast } from '@workspace/ui/components/sonner'
import { ActivityTable, ListPagination } from '../activity/ActivityTable'
import {
  getCaptureRecords,
  deleteCaptureRecords,
  clearCaptureRecords,
  type CaptureRecord,
  type CaptureFilter,
} from '../api/traffic-capture'
import { usePageSignal } from '../auth/use-page-signal'
import { ApiError } from '../api'

export function captureError(error: unknown) {
  if (
    !(error instanceof ApiError) ||
    (!error.handled && error.kind !== 'cancelled')
  )
    toast.error(error instanceof Error ? error.message : '操作失败')
}

export function CaptureConfirmation({
  title,
  close,
  confirm,
}: {
  title: string
  close: () => void
  confirm: () => Promise<unknown>
}) {
  const [pending, setPending] = useState(false)
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) close()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>请确认执行此操作。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <LoadingButton
            loading={pending}
            onClick={async () => {
              setPending(true)
              try {
                await confirm()
              } finally {
                setPending(false)
              }
            }}
            onError={captureError}
          >
            确认
          </LoadingButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
export function CaptureRecords({
  id,
  edgeId,
}: {
  id: string | number
  edgeId?: string | number
}) {
  const [filter, setFilter] = useState<CaptureFilter & { search: string }>({
    page: 1,
    size: 5,
    search: '',
  })
  const [selected, setSelected] = useState<string[]>([])
  const [action, setAction] = useState<'delete' | 'clear' | null>(null)
  const signal = usePageSignal()
  const records = useQuery({
    queryKey: ['capture-records', id, edgeId, filter],
    queryFn: ({ signal }) => getCaptureRecords(id, edgeId, filter, signal),
    retry: false,
  })
  // 原实验入口在请求成功后清空选择；链路入口只保留当前页选择。
  useEffect(() => {
    if (records.dataUpdatedAt > 0) setSelected([])
  }, [records.dataUpdatedAt])
  const data = (records.data?.results ?? []).map((row) => ({
    ...row,
    id: row.name,
  }))
  type Row = CaptureRecord & { id: string }
  function sort(field: 'size' | 'created_time') {
    setFilter({
      ...filter,
      page: 1,
      ordering:
        filter.ordering === field
          ? `-${field}`
          : filter.ordering === `-${field}`
            ? ''
            : field,
    })
  }
  const columns: ColumnDef<Row>[] = [
    {
      id: 'selection',
      header: () => (
        <input
          type="checkbox"
          aria-label="选择本页流量记录"
          checked={
            !!data.length && data.every((row) => selected.includes(row.name))
          }
          onChange={(event) =>
            setSelected(
              event.target.checked
                ? [...new Set([...selected, ...data.map((row) => row.name)])]
                : selected.filter(
                    (name) => !data.some((row) => row.name === name),
                  ),
            )
          }
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`选择 ${row.original.name}`}
          checked={selected.includes(row.original.name)}
          onChange={(event) =>
            setSelected(
              event.target.checked
                ? [...selected, row.original.name]
                : selected.filter((name) => name !== row.original.name),
            )
          }
        />
      ),
    },
    {
      id: 'serial',
      header: '序号',
      cell: ({ row }) => (filter.page - 1) * filter.size + row.index + 1,
    },
    {
      accessorKey: 'name',
      header: edgeId === undefined ? 'pcap名称' : '文件名称',
    },
    {
      accessorKey: 'size',
      header: () =>
        edgeId === undefined ? (
          '大小'
        ) : (
          <Button variant="ghost" onClick={() => sort('size')}>
            文件大小
            {filter.ordering === 'size'
              ? ' ↑'
              : filter.ordering === '-size'
                ? ' ↓'
                : ''}
          </Button>
        ),
    },
    {
      accessorKey: 'created_time',
      header: () =>
        edgeId === undefined ? (
          '采集时间'
        ) : (
          <Button variant="ghost" onClick={() => sort('created_time')}>
            创建时间
            {filter.ordering === 'created_time'
              ? ' ↑'
              : filter.ordering === '-created_time'
                ? ' ↓'
                : ''}
          </Button>
        ),
    },
    ...(edgeId === undefined
      ? [
          {
            accessorKey: 'mark_path',
            header: '采集点',
            cell: ({ row }: { row: { original: Row } }) =>
              row.original.mark_path || '--',
          },
        ]
      : []),
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            variant="link"
            onClick={() => {
              if (row.original.detail)
                window.open(row.original.detail, '_blank', 'noopener')
            }}
          >
            详情
          </Button>
          <Button variant="link" asChild>
            <a
              href={`/api/front/topo/capture_pcap_download/${row.original.name}`}
              download
            >
              下载
            </a>
          </Button>
          <Button
            variant="link"
            onClick={() => {
              setSelected([row.original.name])
              setAction('delete')
            }}
          >
            删除
          </Button>
        </div>
      ),
    },
  ]
  async function confirm() {
    if (action === 'clear') await clearCaptureRecords(id, signal())
    else await deleteCaptureRecords(selected, signal())
    if (signal().aborted) return
    setSelected([])
    setAction(null)
    toast.success(action === 'clear' ? '清空成功' : '删除成功！')
    if (action === 'clear' && filter.page !== 1)
      setFilter({ ...filter, page: 1 })
    else if (filter.page > 1 && data.length <= selected.length)
      setFilter({ ...filter, page: filter.page - 1 })
    else await records.refetch()
  }
  return (
    <section className="space-y-3" aria-label="流量记录区域">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          aria-label="搜索流量记录"
          placeholder={edgeId === undefined ? '请输入关键字' : '输入搜索内容'}
          maxLength={300}
          className="max-w-xs"
          value={filter.search}
          onChange={(event) =>
            setFilter({ ...filter, page: 1, search: event.target.value })
          }
        />
        <div className="flex gap-2">
          <Button
            disabled={!selected.length || records.isFetching}
            variant="destructive"
            onClick={() => setAction('delete')}
          >
            批量删除
          </Button>
          {edgeId === undefined ? (
            <Button variant="destructive" onClick={() => setAction('clear')}>
              全部清空
            </Button>
          ) : (
            <Button
              onClick={async () => {
                const result = await records.refetch()
                if (!result.error) toast.success('刷新成功')
              }}
            >
              刷新
            </Button>
          )}
        </div>
      </div>
      {records.isPending ? (
        <p role="status">正在加载流量记录…</p>
      ) : records.isError ? (
        <p role="alert">流量记录读取失败：{records.error.message}</p>
      ) : (
        <ActivityTable
          name="流量记录"
          empty="暂无流量记录"
          data={data}
          columns={columns}
        />
      )}
      <ListPagination
        {...filter}
        count={records.data?.count ?? 0}
        change={(page) => setFilter({ ...filter, page })}
        busy={records.isFetching}
      />
      {action && (
        <CaptureConfirmation
          title={action === 'clear' ? '确认清空记录？' : '确认删除流量包？'}
          close={() => setAction(null)}
          confirm={confirm}
        />
      )}
    </section>
  )
}
