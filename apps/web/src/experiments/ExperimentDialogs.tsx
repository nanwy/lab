import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@workspace/ui/components/button'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  RadioGroup,
  RadioGroupItem,
} from '@workspace/ui/components/radio-group'
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
import { ActivityTable, ListPagination } from '../activity/ActivityTable'
import {
  deleteExperiment,
  experimentKeys,
  getExperimentScenes,
  importExperiment,
  type Experiment,
} from '../api/experiments'
import { usePageSignal } from '../auth/use-page-signal'
import { useAccessFailure } from '../auth/access'
import { ExperimentForm } from './ExperimentForm'

export const EditExperimentModal = NiceModal.create(
  ({ experiment }: { experiment?: Experiment }) => {
    const modal = useModal()
    function close() {
      modal.resolve()
      modal.remove()
    }
    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => {
          if (!open) close()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{experiment ? '编辑实验' : '新建实验'}</DialogTitle>
            <DialogDescription>编辑实验名称和概述。</DialogDescription>
          </DialogHeader>
          <ExperimentForm
            experiment={experiment}
            saved={async () => close()}
            cancel={close}
          />
        </DialogContent>
      </Dialog>
    )
  },
)

export const DeleteExperimentModal = NiceModal.create(
  ({
    experiment,
    deleted,
  }: {
    experiment: Experiment
    deleted: () => Promise<void>
  }) => {
    const modal = useModal()
    const signalForPage = usePageSignal()
    const accessFailure = useAccessFailure()
    const [error, setError] = useState('')
    function close() {
      modal.resolve()
      modal.remove()
    }
    async function remove() {
      const signal = signalForPage()
      setError('')
      try {
        await deleteExperiment(experiment.id, signal)
        if (signal.aborted) return
        await deleted()
        if (!signal.aborted) close()
      } catch (failure) {
        if (!signal.aborted && !accessFailure(failure))
          setError('删除失败，实验记录已保留，请重试。')
      }
    }
    return (
      <AlertDialog
        open={modal.visible}
        onOpenChange={(open) => {
          if (!open) close()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除实验记录</AlertDialogTitle>
            <AlertDialogDescription>
              确认删除“{experiment.name}”？删除后不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={close}>取消</AlertDialogCancel>
            <LoadingButton variant="destructive" onClick={remove}>
              确认删除
            </LoadingButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  },
)

export const SelectSceneModal = NiceModal.create(() => {
  const modal = useModal()
  const client = useQueryClient()
  const signalForPage = usePageSignal()
  const accessFailure = useAccessFailure()
  const [filter, setFilter] = useState({ page: 1, search: '' })
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const scenes = useQuery({
    queryKey: ['experiment-scenes', filter],
    queryFn: ({ signal }) =>
      getExperimentScenes(filter.page, filter.search, signal),
    retry: false,
  })
  function close() {
    modal.resolve()
    modal.remove()
  }
  async function importScene() {
    setError('')
    if (!selected) {
      setError('请选择场景')
      return
    }
    const signal = signalForPage()
    try {
      await importExperiment(selected, signal)
      if (signal.aborted) return
      await client.invalidateQueries({ queryKey: experimentKeys.lists })
      if (!signal.aborted) close()
    } catch (failure) {
      if (!signal.aborted && !accessFailure(failure))
        setError('导入失败，所选场景已保留，请重试。')
    }
  }
  return (
    <Dialog
      open={modal.visible}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>从场景库选择</DialogTitle>
          <DialogDescription>
            单选一个场景，保存后创建实验。翻页保留选择。
          </DialogDescription>
        </DialogHeader>
        <Label htmlFor="scene-search">搜索场景</Label>
        <Input
          id="scene-search"
          maxLength={300}
          value={filter.search}
          onChange={(event) =>
            setFilter({ page: 1, search: event.target.value })
          }
        />
        {scenes.isPending ? (
          <p role="status">正在加载场景…</p>
        ) : scenes.isError ? (
          <p role="alert">
            场景读取失败。
            <Button variant="link" onClick={() => void scenes.refetch()}>
              重试场景
            </Button>
          </p>
        ) : (
          <>
            <RadioGroup
              aria-label="选择场景"
              value={selected}
              onValueChange={setSelected}
            >
              <ActivityTable
                name="场景库"
                data={scenes.data.results}
                empty="暂无可选场景"
                columns={[
                  {
                    id: 'select',
                    header: '选择',
                    cell: ({ row }) => (
                      <RadioGroupItem
                        value={String(row.original.id)}
                        aria-label={`选择${row.original.name}`}
                      />
                    ),
                  },
                  { accessorKey: 'name', header: '场景名称' },
                  { accessorKey: 'sub_user', header: '创建人' },
                  { accessorKey: 'create_time', header: '创建时间' },
                ]}
              />
            </RadioGroup>
            <ListPagination
              page={filter.page}
              size={10}
              count={scenes.data.count}
              busy={scenes.isFetching}
              change={(page) => setFilter({ ...filter, page })}
            />
          </>
        )}
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={close}>
            取消
          </Button>
          <LoadingButton onClick={importScene}>保存</LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  )
})
