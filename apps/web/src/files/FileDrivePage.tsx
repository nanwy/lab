import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import { useState, type ReactNode } from 'react'
import { Button } from '@workspace/ui/components/button'
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
import {
  getFiles,
  fileDownloadName,
  fileListKey,
  isOfficeFile,
  type DriveFile,
  type FileScope,
} from '../api/files'
import { ApiError } from '../api'
import { currentUserQueryOptions } from '../auth/session'
import './files.css'

export type FileActionsContext = {
  path: string
  selected: DriveFile[]
  clearSelection: () => void
  refresh: () => Promise<unknown>
}
export type FileDrivePageProps = {
  personalActions?: (context: FileActionsContext) => ReactNode
  rowActions?: (file: DriveFile, context: FileActionsContext) => ReactNode
}

export function FileDrivePage(props: FileDrivePageProps) {
  const { data: account } = useQuery(currentUserQueryOptions())
  const [scope, setScope] = useState<FileScope>('public')
  return (
    <section className="file-drive">
      <header className="file-drive-heading">
        <div>
          <p className="file-eyebrow">RESOURCE ARCHIVE / 资料档案室</p>
          <h1>资源网盘</h1>
          <p>有序归档，随时取用。</p>
        </div>
        <span className="file-archive-mark" aria-hidden="true">
          文 / 件
        </span>
      </header>
      <div className="file-tabs" role="tablist" aria-label="资料范围">
        {(['public', 'personal'] as const).map((value) => (
          <button
            type="button"
            role="tab"
            aria-label={value === 'public' ? '公开资料' : '个人资料'}
            aria-selected={scope === value}
            key={value}
            onClick={() => setScope(value)}
          >
            {value === 'public' ? '公开资料' : '个人资料'}
            <span>{value === 'public' ? 'PUBLIC' : 'PERSONAL'}</span>
          </button>
        ))}
      </div>
      {account ? (
        <FileDirectory
          key={`${account.id}:${scope}`}
          scope={scope}
          accountId={account.id}
          {...props}
        />
      ) : null}
    </section>
  )
}

function FileDirectory({
  scope,
  accountId,
  ...actions
}: FileDrivePageProps & { scope: FileScope; accountId: string | number }) {
  const [path, setPath] = useState('/')
  return (
    <DirectoryContents
      key={path}
      scope={scope}
      accountId={accountId}
      path={path}
      navigate={setPath}
      {...actions}
    />
  )
}
function DirectoryContents({
  scope,
  accountId,
  path,
  navigate,
  personalActions,
  rowActions,
}: FileDrivePageProps & {
  scope: FileScope
  accountId: string | number
  path: string
  navigate: (path: string) => void
}) {
  const client = useQueryClient()
  const queryKey = fileListKey(accountId, scope, path)
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getFiles(scope, path, signal),
    retry: false,
  })
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [video, setVideo] = useState<DriveFile | null>(null)
  const files = query.data ?? []
  const context: FileActionsContext = {
    path,
    selected: files.filter((file) => selection[String(file.id)]),
    clearSelection: () => setSelection({}),
    refresh: async () => {
      await client.cancelQueries({ queryKey, exact: true })
      await client.invalidateQueries({
        queryKey,
        exact: true,
        refetchType: 'active',
      })
    },
  }
  const columns: ColumnDef<DriveFile>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="选择全部文件"
          checked={
            table.getIsAllRowsSelected() && table.getRowModel().rows.length > 0
          }
          onChange={table.getToggleAllRowsSelectedHandler()}
          disabled={table.getRowModel().rows.length === 0}
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
      sortingFn: (a, b) => a.original.name.localeCompare(b.original.name),
      cell: ({ row }) => {
        const file = row.original
        return (
          <div className="file-name">
            <span
              className={`file-glyph ${file.is_file ? '' : 'file-folder'}`}
              aria-hidden="true"
            >
              {file.is_file ? '↗' : '▰'}
            </span>
            {!file.is_file ? (
              <button type="button" onClick={() => navigate(file.path)}>
                {file.name}
              </button>
            ) : file.attached && !isOfficeFile(file.attached) ? (
              file.type === 'video/mp4' ? (
                <button type="button" onClick={() => setVideo(file)}>
                  {file.name}
                </button>
              ) : (
                <a
                  title={file.name}
                  href={file.attached}
                  target="_blank"
                  rel="noreferrer"
                  download={file.type === 'text/plain'}
                >
                  {file.name}
                </a>
              )
            ) : (
              <span title={file.name}>{file.name}</span>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: 'size',
      header: '大小',
      cell: ({ row }) =>
        row.original.is_file && !row.original.isLink
          ? formatBytes(row.original.size)
          : '—',
    },
    ...(scope === 'personal'
      ? [
          {
            accessorKey: 'source_info',
            header: '文件来源',
            cell: ({ row }) =>
              row.original.is_file
                ? row.original.source_info || '个人上传'
                : '—',
          } as ColumnDef<DriveFile>,
        ]
      : []),
    {
      accessorKey: 'altertime',
      header: '修改时间',
      sortingFn: (a, b) =>
        a.original.altertime.localeCompare(b.original.altertime),
    },
    ...(scope === 'personal'
      ? [
          {
            id: 'sharing',
            header: '状态',
            cell: ({ row }) => (
              <span className="file-status">
                {row.original.is_share === 1 ? '共享' : '私有'}
              </span>
            ),
          } as ColumnDef<DriveFile>,
        ]
      : []),
    {
      id: 'actions',
      header: '操作',
    },
  ]
  const table = useReactTable({
    data: files,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => String(row.id),
    state: { rowSelection: selection, sorting },
    onRowSelectionChange: setSelection,
    onSortingChange: setSorting,
    enableRowSelection: true,
  })
  const segments = path === '/' ? [] : path.slice(1).split('/')
  return (
    <div className="file-directory">
      <div className="file-toolbar">
        <nav aria-label="文件路径">
          <button type="button" onClick={() => navigate('/')}>
            全部文件
          </button>
          {segments.length > 3 ? <span aria-hidden="true"> / … </span> : null}
          {segments.map((segment, index) =>
            index < segments.length - 3 ? null : (
              <span key={index}>
                <span aria-hidden="true"> / </span>
                <button
                  type="button"
                  aria-current={
                    index === segments.length - 1 ? 'location' : undefined
                  }
                  onClick={() =>
                    navigate('/' + segments.slice(0, index + 1).join('/'))
                  }
                >
                  {segment}
                </button>
              </span>
            ),
          )}
        </nav>
        <div className="file-toolbar-actions">
          {scope === 'personal' ? (
            personalActions?.(context)
          ) : (
            <Button variant="outline" disabled title="打包下载暂不可用">
              打包下载
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            刷新
          </Button>
        </div>
      </div>
      <div className="file-list-meta">
        <span>
          {context.selected.length
            ? `已选择 ${context.selected.length} 项`
            : scope === 'public'
              ? '公开共享 · 自由取用'
              : '个人归档'}
        </span>
        <span>{files.length} 项</span>
      </div>
      <div className="file-table-scroll">
        <Table aria-label={scope === 'public' ? '公开文件' : '个人文件'}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="file-sort"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        <span aria-hidden="true">
                          {header.column.getIsSorted() === 'asc'
                            ? '↑'
                            : header.column.getIsSorted() === 'desc'
                              ? '↓'
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
            {path !== '/' ? (
              <TableRow>
                <TableCell />
                <TableCell colSpan={columns.length - 1}>
                  <button
                    type="button"
                    className="file-parent"
                    onClick={() =>
                      navigate(path.slice(0, path.lastIndexOf('/')) || '/')
                    }
                  >
                    返回上级 <span aria-hidden="true">↰</span>
                  </button>
                </TableCell>
              </TableRow>
            ) : null}
            {!query.isError
              ? table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    onDoubleClick={() => {
                      if (!row.original.is_file) navigate(row.original.path)
                    }}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {cell.column.id === 'actions' ? (
                          <FileActionsCell
                            file={row.original}
                            scope={scope}
                            context={context}
                            rowActions={rowActions}
                          />
                        ) : (
                          flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>
      {query.isPending ? (
        <div className="file-empty" role="status">
          <span className="file-loading" />
          正在读取目录…
        </div>
      ) : query.isError ? (
        <div className="file-empty">
          <p>
            {query.error instanceof ApiError && query.error.handled
              ? '目录读取失败'
              : query.error.message}
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            重试目录
          </Button>
        </div>
      ) : files.length === 0 ? (
        <div className="file-empty">
          <span aria-hidden="true">▱</span>
          <p>此目录暂无文件</p>
        </div>
      ) : null}
      <footer className="file-footer">
        <span>文件归档 / {scope === 'public' ? '公开资料' : '个人资料'}</span>
        {scope === 'public' ? <span>打包下载暂不可用</span> : null}
      </footer>
      <Dialog
        open={Boolean(video)}
        onOpenChange={(open) => {
          if (!open) setVideo(null)
        }}
      >
        <DialogContent className="file-video-dialog">
          <DialogHeader>
            <DialogTitle>{video?.name}</DialogTitle>
          </DialogHeader>
          {video?.attached ? (
            <video src={video.attached} controls autoPlay preload="metadata" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
function formatBytes(size: number) {
  if (!size) return '0 B'
  const level = Math.min(Math.floor(Math.log(size) / Math.log(1024)), 4)
  return `${(size / 1024 ** level).toFixed(level ? 2 : 0)} ${['B', 'KB', 'MB', 'GB', 'TB'][level]}`
}

function FileActionsCell({
  file,
  scope,
  context,
  rowActions,
}: {
  file: DriveFile
  scope: FileScope
  context: FileActionsContext
  rowActions: FileDrivePageProps['rowActions']
}) {
  return (
    <div className="file-row-actions">
      {file.is_file && file.attached ? (
        <a
          href={file.attached}
          download={fileDownloadName(scope, file.attached, file.name)}
          aria-label={`下载 ${file.name}`}
        >
          下载 <span aria-hidden="true">↓</span>
        </a>
      ) : (
        <span className="file-muted">—</span>
      )}
      {scope === 'personal' ? rowActions?.(file, context) : null}
    </div>
  )
}
