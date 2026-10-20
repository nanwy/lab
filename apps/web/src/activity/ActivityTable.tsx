import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@workspace/ui/components/pagination'
import { Button } from '@workspace/ui/components/button'
import { Empty, EmptyHeader, EmptyTitle } from '@workspace/ui/components/empty'

// 仅共享三类事务的表格展示；分页和协议由各业务组件管理。
export function ActivityTable<T extends { id: string | number }>({
  data,
  columns,
  empty,
  name,
}: {
  data: T[]
  columns: ColumnDef<T>[]
  empty: string
  name: string
}) {
  const table = useReactTable({
    getRowId: (row) => String(row.id),
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
  if (!data.length)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{empty}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  return (
    <Table aria-label={name}>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead key={header.id}>
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell
                key={cell.id}
                className="max-w-80 whitespace-normal break-words"
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function ListPagination({
  page,
  size,
  count,
  change,
  busy,
}: {
  page: number
  size: number
  count: number
  change: (page: number) => void
  busy: boolean
}) {
  return (
    <Pagination aria-label="列表分页">
      <PaginationContent>
        <PaginationItem>
          <Button
            variant="outline"
            disabled={page <= 1 || busy}
            onClick={() => change(page - 1)}
          >
            上一页
          </Button>
        </PaginationItem>
        <PaginationItem>
          <span className="px-2">
            第 {page} / {Math.max(1, Math.ceil(count / size))} 页，共 {count} 项
          </span>
        </PaginationItem>
        <PaginationItem>
          <Button
            variant="outline"
            disabled={page * size >= count || busy}
            onClick={() => change(page + 1)}
          >
            下一页
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
