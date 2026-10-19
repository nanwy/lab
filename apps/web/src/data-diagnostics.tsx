import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type PaginationState, type RowSelectionState, type SortingState } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { z } from 'zod'

import { ApiError, apiClient } from './api'
import { getSamples, updateSample, type Sample } from './api/samples'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table'

const schema = z.object({
  name: z.string().trim().min(2, '名称至少 2 个字符'),
  metadata: z.object({ aliases: z.array(z.string().trim().min(1, '别名不能为空')).max(5, '最多 5 个别名') }),
})

function errorText(errors: unknown[]) {
  return errors.map(error => typeof error === 'string' ? error : error && typeof error === 'object' && 'message' in error ? String(error.message) : '').filter(Boolean).join('；')
}

function SampleEditor({ sample, onSaved }: { sample: Sample; onSaved: () => Promise<void> }) {
  const [notice, setNotice] = useState('')
  const form = useForm({
    defaultValues: { name: sample.name, metadata: { aliases: [...sample.metadata.aliases] } },
    validators: { onSubmit: schema },
    onSubmit: async ({ value, formApi }) => {
      setNotice('')
      try {
        // Standard Schema validators validate without transforming the stored form value.
        await updateSample(sample.id, schema.parse(value))
        await onSaved()
        setNotice('模拟保存成功，列表已刷新')
      } catch (error) {
        if (error instanceof ApiError && error.fieldErrors?.name) {
          formApi.setErrorMap({ onServer: { fields: { name: error.fieldErrors.name } } })
        }
        setNotice(error instanceof ApiError ? error.message : '保存失败，请重试')
      }
    },
  })

  return <section className="mt-7 border-t border-slate-200 pt-6" aria-label="样本编辑器">
    <h2 className="text-xl font-semibold">编辑 {sample.id}</h2>
    <p>名称输入“保留名称”可验证服务端字段错误。动态别名只属于模拟样本。</p>
    <form className="grid max-w-xl gap-4" onSubmit={event => { event.preventDefault(); event.stopPropagation(); void form.handleSubmit() }}>
      <form.Field name="name">{field => <label className="grid gap-2">
        <span>样本名称</span>
        <Input aria-label="样本名称" aria-describedby="sample-name-errors" aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onBlur={field.handleBlur} onChange={event => { setNotice(''); form.setErrorMap({ onServer: undefined }); field.handleChange(event.target.value) }} />
        <span id="sample-name-errors" role="alert" className="text-sm text-red-800">{errorText(field.state.meta.errors)}</span>
      </label>}</form.Field>
      <form.Field name="metadata.aliases" mode="array">{field => <fieldset className="grid gap-3">
        <legend className="mb-2 font-medium">嵌套动态别名</legend>
        {field.state.value.map((_, index) => <form.Field key={index} name={`metadata.aliases[${index}]`}>{alias => <div className="grid gap-2">
          <div className="flex gap-2"><Input aria-label={`别名 ${index + 1}`} aria-invalid={alias.state.meta.errors.length > 0} value={alias.state.value} onBlur={alias.handleBlur} onChange={event => alias.handleChange(event.target.value)} /><Button type="button" onClick={() => field.removeValue(index)}>移除别名 {index + 1}</Button></div>
          <span role="alert" className="text-sm text-red-800">{errorText(alias.state.meta.errors)}</span>
        </div>}</form.Field>)}
        <Button type="button" className="justify-self-start" disabled={field.state.value.length >= 5} onClick={() => field.pushValue('')}>添加别名</Button>
      </fieldset>}</form.Field>
      <form.Subscribe selector={state => state.isSubmitting}>{submitting => <Button variant="default" className="justify-self-start" type="submit" disabled={submitting}>{submitting ? '正在模拟保存…' : '保存模拟样本'}</Button>}</form.Subscribe>
      <p aria-live="polite" className="text-sm">{notice}</p>
    </form>
  </section>
}

export function DataDiagnosticsPage() {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_MSW === 'false') {
    return <section><h1>表格与表单诊断</h1><p>此技术样本仅在启用 MSW 的开发环境可用。当前环境不会发送样本读取或写入请求。</p></section>
  }
  return <DataDiagnosticsContent />
}

function DataDiagnosticsContent() {
  const queryClient = useQueryClient()
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 5 })
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }])
  const [filter, setFilter] = useState('')
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [editing, setEditing] = useState<Sample>()
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')
  const query = useQuery({ queryKey: ['sample-diagnostics', pagination, sorting, filter], queryFn: ({ signal }) => getSamples({ page: pagination.pageIndex, pageSize: pagination.pageSize, filter, descending: sorting[0]?.desc ?? false }, signal), retry: false })
  const columns = useMemo<ColumnDef<Sample>[]>(() => [
    { id: 'select', header: ({ table }) => <input type="checkbox" aria-label="选择本页所有样本" checked={table.getIsAllPageRowsSelected()} ref={element => { if (element) element.indeterminate = table.getIsSomePageRowsSelected() }} onChange={table.getToggleAllPageRowsSelectedHandler()} />, cell: ({ row }) => <input type="checkbox" aria-label={`选择 ${row.id}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} /> },
    { accessorKey: 'name', header: ({ column }) => <Button type="button" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>名称 {column.getIsSorted() === 'desc' ? '↓' : '↑'}</Button> },
    { id: 'aliases', header: '别名', cell: ({ row }) => row.original.metadata.aliases.join('、') || '无' },
    { id: 'edit', header: '操作', cell: ({ row }) => <Button type="button" onClick={() => setEditing(row.original)}>编辑 {row.id}</Button> },
  ], [])
  const table = useReactTable({
    data: query.data?.items ?? [], columns,
    state: { pagination, sorting, rowSelection: selection },
    rowCount: query.data?.total ?? 0,
    getRowId: row => row.id,
    onPaginationChange: setPagination,
    onSortingChange: updater => { setSorting(updater); setPagination(previous => ({ ...previous, pageIndex: 0 })) },
    onRowSelectionChange: setSelection,
    manualPagination: true, manualSorting: true, manualFiltering: true,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
  })
  async function reset() {
    setResetting(true)
    setResetError('')
    try {
      await apiClient.request('/diagnostics/samples/reset', { method: 'POST' })
      setEditing(undefined)
      setSelection({})
      setPagination({ pageIndex: 0, pageSize: 5 })
      setSorting([{ id: 'name', desc: false }])
      setFilter('')
      await queryClient.invalidateQueries({ queryKey: ['sample-diagnostics'] })
    } catch {
      setResetError('模拟重置失败，请重试')
    } finally { setResetting(false) }
  }
  return <section className="data-diagnostics">
    <p className="eyebrow">Table + Form diagnostics</p>
    <h1>表格与表单诊断</h1>
    <p>独立技术样本，不代表课程、实验等正式业务。分页、排序和筛选由模拟接口对完整集合处理，所有写入只作用于本地 MSW 内存。</p>
    <div className="my-5 flex flex-wrap items-end gap-4">
      <label className="grid gap-2 text-sm"><span>按名称筛选</span><Input aria-label="筛选样本名称" value={filter} onChange={event => { setFilter(event.target.value); setPagination(previous => ({ ...previous, pageIndex: 0 })) }} /></label>
      <Button type="button" disabled={resetting} onClick={() => void reset()}>重置模拟样本</Button>
    </div>
    {resetError ? <p role="alert">{resetError}</p> : null}
    <p aria-live="polite">已选 {Object.values(selection).filter(Boolean).length} 项（跨页保留）；共 {query.data?.total ?? 0} 项</p>
    {query.isError ? <p role="alert">样本读取失败，请重试。<Button type="button" onClick={() => void query.refetch()}>重试读取</Button></p> : null}
    <Table aria-label="模拟样本表格"><TableHeader>{table.getHeaderGroups().map(group => <TableRow key={group.id}>{group.headers.map(header => <TableHead key={header.id} aria-sort={header.column.id === 'name' ? sorting[0]?.desc ? 'descending' : 'ascending' : undefined}>{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader>
      <TableBody>{query.isPending ? <TableRow><TableCell colSpan={4}>正在读取样本…</TableCell></TableRow> : table.getRowModel().rows.length === 0 ? <TableRow><TableCell colSpan={4}>没有匹配的样本</TableCell></TableRow> : table.getRowModel().rows.map(row => <TableRow key={row.id} data-state={row.getIsSelected() ? 'selected' : undefined}>{row.getVisibleCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}</TableBody>
    </Table>
    <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="button" disabled={!table.getCanPreviousPage() || query.isFetching} onClick={() => table.previousPage()}>上一页</Button><span>第 {pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())} 页</span><Button type="button" disabled={!table.getCanNextPage() || query.isFetching} onClick={() => table.nextPage()}>下一页</Button></div>
    {editing ? <SampleEditor key={editing.id} sample={editing} onSaved={() => queryClient.invalidateQueries({ queryKey: ['sample-diagnostics'] })} /> : null}
  </section>
}
