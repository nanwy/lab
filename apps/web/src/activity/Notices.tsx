import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Button } from '@workspace/ui/components/button'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Tabs, TabsList, TabsTrigger } from '@workspace/ui/components/tabs'
import { Badge } from '@workspace/ui/components/badge'
import { Alert, AlertDescription } from '@workspace/ui/components/alert'
import {
  activityKeys,
  getNotices,
  getNoticeDetail,
  readAllNotices,
  type ItemId,
  type Notice,
} from '../api/activity'
import { usePageSignal } from '../auth/use-page-signal'
import { useAccessFailure } from '../auth/access'
import { ActivityTable, ListPagination } from './ActivityTable'
import { refreshNotices } from './queries'

export const NoticeDetailModal = NiceModal.create(
  ({ itemId }: { itemId: ItemId }) => {
    const modal = useModal()
    const { resolve } = modal
    const client = useQueryClient()
    const detail = useQuery({
      queryKey: ['account', 'notice-detail', itemId],
      queryFn: ({ signal }) => getNoticeDetail(itemId, signal),
      retry: false,
      gcTime: 0,
      refetchOnReconnect: false,
    })
    useEffect(() => {
      if (detail.isSuccess) {
        void refreshNotices(client)
        resolve(true)
      }
    }, [client, detail.isSuccess, resolve])
    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => {
          if (!open) {
            modal.resolve()
            modal.remove()
          }
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>通知详情</DialogTitle>
            <DialogDescription>
              查看通知正文，成功读取后标记为已读。
            </DialogDescription>
          </DialogHeader>
          {detail.isPending ? (
            <p role="status">正在读取通知…</p>
          ) : detail.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                通知读取失败。
                <Button variant="link" onClick={() => void detail.refetch()}>
                  重试详情
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <article className="space-y-4 break-words">
              <h3 className="font-semibold">{detail.data.title}</h3>
              <p className="whitespace-pre-wrap">{detail.data.content}</p>
              <time className="text-sm text-muted-foreground">
                {detail.data.pub_time}
              </time>
            </article>
          )}
        </DialogContent>
      </Dialog>
    )
  },
)

export function NoticesPanel({ size = 10 }: { size?: number }) {
  const [filter, setFilter] = useState({ page: 1, isRead: 0 })
  const [error, setError] = useState('')
  const client = useQueryClient()
  const signalForPage = usePageSignal()
  const accessFailure = useAccessFailure()
  const list = useQuery({
    queryKey: [...activityKeys.notices, filter, size],
    queryFn: ({ signal }) =>
      getNotices(filter.page, size, filter.isRead, signal),
    retry: false,
  })
  const columns = [
    {
      id: 'title',
      header: '标题',
      cell: ({ row }: { row: { original: Notice } }) => (
        <Button
          variant="link"
          className="h-auto max-w-full justify-start whitespace-normal p-0 text-left"
          onClick={() => {
            void NiceModal.show(NoticeDetailModal, {
              itemId: row.original.id,
            }).then((read) => {
              if (read) setFilter((current) => ({ ...current, page: 1 }))
            })
          }}
        >
          {row.original.title}
        </Button>
      ),
    },
    { accessorKey: 'pub_time', header: '发布时间' },
    {
      id: 'read',
      header: '状态',
      cell: ({ row }: { row: { original: Notice } }) => (
        <Badge variant={row.original.is_read ? 'secondary' : 'default'}>
          {row.original.is_read ? '已读' : '未读'}
        </Badge>
      ),
    },
  ]
  async function readAll() {
    const signal = signalForPage()
    setError('')
    try {
      await readAllNotices(signal)
      if (!signal.aborted) {
        setFilter((current) => ({ ...current, page: 1 }))
        await refreshNotices(client)
      }
    } catch (error) {
      if (!signal.aborted && !accessFailure(error))
        setError('全部已读失败，请重试。')
    }
  }
  return (
    <section className="min-w-0 space-y-4" aria-label="消息列表">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={String(filter.isRead)}
          onValueChange={(value) =>
            setFilter({ page: 1, isRead: Number(value) })
          }
        >
          <TabsList>
            <TabsTrigger value="0">全部消息</TabsTrigger>
            <TabsTrigger value="2">未读消息</TabsTrigger>
            <TabsTrigger value="1">已读消息</TabsTrigger>
          </TabsList>
        </Tabs>
        <LoadingButton variant="outline" onClick={readAll}>
          全部已读
        </LoadingButton>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {list.isPending ? (
        <p role="status">正在读取消息…</p>
      ) : list.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            消息读取失败。
            <Button variant="link" onClick={() => void list.refetch()}>
              重试消息
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <ActivityTable
            name="通知列表"
            data={list.data.results}
            columns={columns}
            empty="暂无消息"
          />
          <ListPagination
            page={filter.page}
            size={size}
            count={list.data.count}
            busy={list.isFetching}
            change={(page) => setFilter({ ...filter, page })}
          />
        </>
      )}
    </section>
  )
}

export const NoticesModal = NiceModal.create(() => {
  const modal = useModal()
  return (
    <Dialog
      open={modal.visible}
      onOpenChange={(open) => {
        if (!open) {
          modal.resolve()
          modal.remove()
        }
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>系统消息</DialogTitle>
          <DialogDescription>通知列表与个人中心共用状态。</DialogDescription>
        </DialogHeader>
        <NoticesPanel size={3} />
      </DialogContent>
    </Dialog>
  )
})
