import { Loading } from '@workspace/ui/components/loading'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from '@tanstack/react-table'
import { Button } from '@workspace/ui/components/button'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { toast } from '@workspace/ui/components/sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { ApiError } from '../api'
import {
  getDetectionMaterials,
  exportDetectionMaterials,
  detectionDownloadName,
  type DetectionMaterial,
} from '../api/detection-materials'
import { isOfficeFile } from '../api/files'
import { usePageSignal } from '../auth/use-page-signal'
import { FileTypeGlyph, formatBytes } from '../files/file-presentation'
import '../files/files.css'

export function DetectionMaterials({
  toolId,
  context,
}: {
  toolId: string | number
  context: (string | number)[]
}) {
  const [path, setPath] = useState('/')
  const [sorting, setSorting] = useState<SortingState>([])
  return (
    <MaterialsDirectory
      key={path}
      toolId={toolId}
      context={context}
      path={path}
      navigate={setPath}
      sorting={sorting}
      setSorting={setSorting}
    />
  )
}
function MaterialsDirectory({
  toolId,
  context,
  path,
  navigate,
  sorting,
  setSorting,
}: {
  toolId: string | number
  context: (string | number)[]
  path: string
  navigate: (value: string) => void
  sorting: SortingState
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>
}) {
  const query = useQuery({
    queryKey: ['detection-tools', ...context, 'materials', toolId, path],
    queryFn: ({ signal }) => getDetectionMaterials(toolId, path, signal),
    retry: false,
  })
  const [snapshot, setSelection] = useState<{
    rows: RowSelectionState
    readAt: number
  }>({ rows: {}, readAt: query.dataUpdatedAt })
  const selection = snapshot.readAt === query.dataUpdatedAt ? snapshot.rows : {}
  const [video, setVideo] = useState<DetectionMaterial | null>(null)
  const [pending, setPending] = useState(false)
  const pageSignal = usePageSignal()
  const files = query.isError ? [] : (query.data ?? [])
  const selected = files.filter(
    (file) => selection[String(file.id)] && file.id !== '..',
  )
  async function startExport() {
    if (pending || !selected.length) return
    const signal = pageSignal()
    setPending(true)
    try {
      const archive = await exportDetectionMaterials(
        toolId,
        selected.map((file) => file.id),
        signal,
      )
      if (signal.aborted) return
      const link = document.createElement('a')
      link.href = archive.download_url
      link.download = archive.filename
      document.body.append(link)
      link.click()
      link.remove()
      toast.success('下载开始')
    } catch (error) {
      if (!signal.aborted && (!(error instanceof ApiError) || !error.handled))
        toast.error(error instanceof Error ? error.message : '导出失败')
    } finally {
      if (!signal.aborted) setPending(false)
    }
  }
  const columns: ColumnDef<DetectionMaterial>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="选择全部资料"
          disabled={!files.length}
          checked={files.length > 0 && table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`选择 ${row.original.name}`}
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
    },
    {
      accessorKey: 'name',
      header: '名称',
      sortDescFirst: true,
      sortingFn: (a, b) => a.original.name.localeCompare(b.original.name),
      cell: ({ row }) => {
        const file = row.original
        const attached = file.attached
        return (
          <div className="file-name">
            <FileTypeGlyph file={file} />
            {!file.is_file ? (
              <span>{file.name}</span>
            ) : attached && !isOfficeFile(attached) ? (
              /\.mp4$/i.test(attached) ? (
                <button type="button" onClick={() => setVideo(file)}>
                  {file.name}
                </button>
              ) : (
                <a
                  href={attached}
                  target="_blank"
                  rel="noreferrer"
                  download={file.type === 'text/plain'}
                >
                  {file.name}
                </a>
              )
            ) : (
              <span>{file.name}</span>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: 'size',
      header: '大小',
      sortDescFirst: false,
      cell: ({ row }) =>
        row.original.is_file && !row.original.isLink
          ? formatBytes(row.original.size)
          : '',
    },
    {
      accessorKey: 'create_time',
      header: '修改时间',
      sortDescFirst: true,
      sortingFn: (a, b) => {
        const left = a.original.create_time
        const right = b.original.create_time
        if (left === right) return 0
        if (left === null) return -1
        if (right === null) return 1
        return left.localeCompare(right)
      },
      cell: ({ row }) => row.original.create_time,
    },
    {
      id: 'download',
      header: '操作',
      cell: ({ row }) =>
        row.original.is_file && row.original.attached ? (
          <a
            aria-label={`下载 ${row.original.name}`}
            href={row.original.attached}
            download={detectionDownloadName(row.original.attached)}
          >
            下载
          </a>
        ) : (
          <Button variant="ghost" disabled>
            下载
          </Button>
        ),
    },
  ]
  const table = useReactTable({
    data: files,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => String(row.id),
    state: { sorting, rowSelection: selection },
    onSortingChange: setSorting,
    onRowSelectionChange: (update) =>
      setSelection({
        rows: typeof update === 'function' ? update(selection) : update,
        readAt: query.dataUpdatedAt,
      }),
  })
  const segments = path === '/' ? [] : path.slice(1).split('/')
  return (
    <section className="file-directory">
      <div className="file-toolbar">
        <nav aria-label="资料路径">
          <Button variant="ghost" onClick={() => navigate('/')}>
            全部文件
          </Button>
          {segments.length > 3 ? <span> / … </span> : null}
          {segments.map((segment, index) =>
            index < segments.length - 3 ? null : (
              <span key={index}>
                {' '}
                /{' '}
                <Button
                  variant="ghost"
                  onClick={() =>
                    navigate('/' + segments.slice(0, index + 1).join('/'))
                  }
                >
                  {segment}
                </Button>
              </span>
            ),
          )}
        </nav>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => {
              setSelection({ rows: {}, readAt: query.dataUpdatedAt })
              void query.refetch()
            }}
          >
            刷新资料
          </Button>
          <LoadingButton
            loading={pending}
            disabled={!selected.length || query.isFetching}
            onClick={() => void startExport()}
          >
            批量导出
          </LoadingButton>
        </div>
      </div>
      <p className="file-list-meta">
        {selected.length ? `已选择 ${selected.length} 项` : '未选择'}
      </p>
      <Table aria-label="工具相关资料">
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.column.getCanSort() ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      <span aria-hidden="true">
                        {header.column.getIsSorted() === 'desc'
                          ? '↓'
                          : header.column.getIsSorted() === 'asc'
                            ? '↑'
                            : '↕'}
                      </span>
                    </button>
                  ) : (
                    flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {query.isPending ? (
            <TableRow>
              <TableCell colSpan={5}>
                <Loading label="正在读取资料…" />
              </TableCell>
            </TableRow>
          ) : null}
          {path !== '/' ? (
            <TableRow
              onDoubleClick={() =>
                navigate(path.slice(0, path.lastIndexOf('/')) || '/')
              }
            >
              <TableCell />
              <TableCell colSpan={4}>
                <Button
                  variant="ghost"
                  onClick={() =>
                    navigate(path.slice(0, path.lastIndexOf('/')) || '/')
                  }
                >
                  返回上级
                </Button>
              </TableCell>
            </TableRow>
          ) : null}
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              onDoubleClick={() => {
                if (!row.original.is_file) navigate(row.original.path)
              }}
              data-state={row.getIsSelected() ? 'selected' : undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {query.isError ? (
        <div role="alert">
          <p>
            {query.error instanceof ApiError && query.error.status === 403
              ? '无权读取工具资料'
              : '资料读取失败'}
          </p>
          {!(query.error instanceof ApiError && query.error.handled) ? (
            <p>{query.error.message}</p>
          ) : null}
          <Button onClick={() => void query.refetch()}>重试资料</Button>
        </div>
      ) : !query.isPending && !files.length ? (
        <p>此目录暂无资料</p>
      ) : null}
      <Dialog
        open={!!video}
        onOpenChange={(open) => {
          if (!open) setVideo(null)
        }}
      >
        <DialogContent className="file-video-dialog">
          <DialogHeader>
            <DialogTitle>{video?.name}</DialogTitle>
          </DialogHeader>
          {video?.attached ? (
            <video src={video.attached} controls preload="metadata" />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}
