import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import { Button } from '@workspace/ui/components/button'
import { Loading } from '@workspace/ui/components/loading'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { getCourseMaterials, type CourseMaterial } from '../api/courses'
import { fileDownloadName, isOfficeFile } from '../api/files'
import { FileTypeGlyph, formatBytes } from '../files/file-presentation'
import { CourseDialog, CourseMediaDialog } from './CourseDialog'
import { CourseError } from './CourseFeedback'
import '../files/files.css'

export function CourseMaterials({
  courseId,
  account,
  close,
}: {
  courseId: string
  account: string | number
  close: () => void
}) {
  const [path, setPath] = useState('/')
  const [sorting, setSorting] = useState<SortingState>([])
  return (
    <CourseDialog title="学习资料" close={close}>
      <MaterialDirectory
        key={path}
        courseId={courseId}
        account={account}
        path={path}
        navigate={setPath}
        sorting={sorting}
        setSorting={setSorting}
      />
    </CourseDialog>
  )
}
function MaterialDirectory({
  courseId,
  account,
  path,
  navigate,
  sorting,
  setSorting,
}: {
  courseId: string
  account: string | number
  path: string
  navigate: (path: string) => void
  sorting: SortingState
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>
}) {
  const list = useQuery({
    queryKey: ['courses', account, courseId, 'materials', path],
    queryFn: ({ signal }) => getCourseMaterials(courseId, path, signal),
    retry: false,
  })
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [video, setVideo] = useState<string | null>(null)
  const files = list.isError ? [] : (list.data ?? [])
  const columns: ColumnDef<CourseMaterial>[] = [
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
      cell: ({ row: { original: file } }) => (
        <span className="file-name">
          <FileTypeGlyph file={{ ...file, isLink: !!file.isLink }} />
          {file.is_file && file.attached && !isOfficeFile(file.attached) ? (
            file.type === 'video/mp4' ? (
              <button
                type="button"
                className="text-primary"
                onClick={() => setVideo(file.attached!)}
              >
                {file.name}
              </button>
            ) : (
              <a href={file.attached} target="_blank" rel="noreferrer">
                {file.name}
              </a>
            )
          ) : (
            <span>{file.name}</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: 'size',
      header: '大小',
      cell: ({ row: { original: file } }) =>
        file.is_file && !file.isLink ? formatBytes(file.size) : '',
      sortDescFirst: false,
    },
    {
      accessorKey: 'altertime',
      header: '创建时间',
      sortingFn: (a, b) =>
        (a.original.altertime ?? '').localeCompare(b.original.altertime ?? ''),
      sortDescFirst: true,
    },
    {
      id: 'download',
      header: '操作',
      cell: ({ row: { original: file } }) =>
        file.is_file && file.attached ? (
          <a
            aria-label={`下载 ${file.name}`}
            href={file.attached}
            download={fileDownloadName('public', file.attached, file.name)}
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
    getRowId: (r) => String(r.id),
    state: { sorting, rowSelection: selection },
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
  })
  const segments = path === '/' ? [] : path.slice(1).split('/')
  const parent = () => navigate(path.slice(0, path.lastIndexOf('/')) || '/')
  return (
    <section className="space-y-4">
      <nav aria-label="资料路径" className="flex flex-wrap items-center">
        <Button variant="ghost" onClick={() => navigate('/')}>
          全部文件
        </Button>
        {segments.length > 3 ? <span> / … </span> : null}
        {segments.map((name, index) =>
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
                {name}
              </Button>
            </span>
          ),
        )}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>已选择 {Object.values(selection).filter(Boolean).length} 项</span>
        <Button disabled title="批量导出暂不可用，请使用单文件下载。">
          批量导出
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        批量导出暂不可用，请使用单文件下载。
      </p>
      <Table aria-label="课程资料">
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
          {list.isPending ? (
            <TableRow>
              <TableCell colSpan={5}>
                <Loading label="正在读取课程资料…" />
              </TableCell>
            </TableRow>
          ) : null}
          {path !== '/' ? (
            <TableRow onDoubleClick={parent}>
              <TableCell />
              <TableCell colSpan={4}>
                <Button variant="ghost" onClick={parent}>
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
      {list.isError ? (
        <CourseError
          error={list.error}
          title="课程资料读取失败"
          retry={() => void list.refetch()}
        />
      ) : !list.isPending && !files.length ? (
        <p>此目录暂无资料</p>
      ) : null}
      {video ? (
        <CourseMediaDialog
          title="视频播放"
          src={video}
          kind="video"
          close={() => setVideo(null)}
        />
      ) : null}
    </section>
  )
}
