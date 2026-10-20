import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@workspace/ui/components/button'
import { Alert, AlertDescription } from '@workspace/ui/components/alert'
import { activityKeys, getCollections, type Collection } from '../api/activity'
import { ActivityTable, ListPagination } from './ActivityTable'

export function CollectionsPanel() {
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState('')
  const size = 21
  const list = useQuery({
    queryKey: [...activityKeys.collections, 'list', page, size],
    queryFn: ({ signal }) => getCollections(page, size, signal),
    retry: false,
  })
  const columns = [
    {
      id: 'name',
      header: '资源名称',
      cell: ({ row: { original: item } }: { row: { original: Collection } }) =>
        item.is_status && item.attribute === 1 ? (
          <Link
            className="text-primary underline"
            to="/basic/$"
            params={{ _splat: `training/course/${item.object_id}` }}
          >
            {item.extend_info.name}
          </Link>
        ) : (
          <Button
            variant="ghost"
            className="h-auto max-w-full whitespace-normal text-left"
            onClick={() =>
              setNotice(
                item.is_status
                  ? '该类型资源暂未提供跳转入口。'
                  : '该资源已被下线无法查看！',
              )
            }
          >
            {item.extend_info.name}
          </Button>
        ),
    },
    {
      id: 'type',
      header: '类型',
      cell: ({ row }: { row: { original: Collection } }) =>
        ({ 1: '课程', 2: '虚拟科目', 3: '实操', 4: '应用' })[
          row.original.attribute
        ] ?? '未知类型',
    },
    {
      id: 'status',
      header: '状态',
      cell: ({ row }: { row: { original: Collection } }) =>
        row.original.is_status ? '可用' : '已下线',
    },
  ]
  return (
    <section className="min-w-0 space-y-4" aria-label="收藏列表">
      {notice ? <p role="status">{notice}</p> : null}
      {list.isPending ? (
        <p role="status">正在读取收藏…</p>
      ) : list.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            收藏读取失败。
            <Button variant="link" onClick={() => void list.refetch()}>
              重试收藏
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <ActivityTable
            name="我的收藏"
            data={list.data.results}
            columns={columns}
            empty="暂无收藏"
          />
          <ListPagination
            page={page}
            size={size}
            count={list.data.count}
            busy={list.isFetching}
            change={(value) => {
              setNotice('')
              setPage(value)
            }}
          />
        </>
      )}
    </section>
  )
}
