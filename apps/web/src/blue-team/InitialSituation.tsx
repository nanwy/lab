import { useEffect, useMemo, useState } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  Handle,
  Position,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button } from '@workspace/ui/components/button'
import { Loading } from '@workspace/ui/components/loading'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@workspace/ui/components/alert-dialog'
import {
  getSituation,
  situationKeys,
  deleteSituation,
  saveSituation,
  type SituationNode,
} from '../api/blue-situation'
import type { BlueId } from '../api/blue-team'
import { usePageSignal } from '../auth/use-page-signal'
import { SituationForm } from './SituationForm'
import { blueError } from './feedback'

type DataNode = Node<{ item: SituationNode }, 'situation'>
function SituationGraphNode({ data }: NodeProps<DataNode>) {
  const item = data.item
  return (
    <div
      className={`min-w-28 border-2 bg-card p-4 text-center text-card-foreground shadow-sm ${item.data_type === 1 ? 'rounded-full' : 'rounded-md'}`}
      style={{ borderColor: item.color || '#007bff' }}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} />
      {item.data_type === 1 ? (
        <>
          <div>{String(item.define_value)}</div>
          <div className="text-sm text-muted-foreground">
            {item.define_name}
          </div>
        </>
      ) : (
        <>
          <strong>{item.define_name}</strong>
          {item.data_type === 2
            ? item.define_value.map((row, i) => (
                <div key={i}>
                  {row.define_name ?? String(row.data_define)}：
                  {String(row.define_value)}
                </div>
              ))
            : item.define_value[0].define_value.map((value, i) => (
                <div key={i}>{String(value)}</div>
              ))}
        </>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  )
}
const nodeTypes = { situation: SituationGraphNode }
function SituationGraph({
  tree,
  menu,
}: {
  tree: SituationNode[]
  menu: (node: SituationNode | null, point?: { x: number; y: number }) => void
}) {
  const initial = useMemo(() => {
    const nodes: DataNode[] = [],
      edges: { id: string; source: string; target: string }[] = []
    let row = 0
    const visit = (items: SituationNode[], depth: number, parent?: string) => {
      for (const item of items) {
        const id = String(item.id)
        nodes.push({
          id,
          type: 'situation',
          data: { item },
          position: { x: depth * 250, y: row++ * 140 },
        })
        if (parent)
          edges.push({ id: `${parent}-${id}`, source: parent, target: id })
        visit(item.child ?? [], depth + 1, id)
      }
    }
    visit(tree, 0)
    return { nodes, edges }
  }, [tree])
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  useEffect(
    () =>
      setNodes((previous) =>
        initial.nodes.map((node) => ({
          ...node,
          position:
            previous.find((item) => item.id === node.id)?.position ??
            node.position,
        })),
      ),
    [initial.nodes, setNodes],
  )
  return (
    <div
      className="h-[480px] rounded border"
      onContextMenu={(event) => event.preventDefault()}
    >
      <ReactFlow
        nodes={nodes}
        edges={initial.edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        nodesConnectable={false}
        fitView
        minZoom={0.1}
        onNodeContextMenu={(event, node) => {
          event.preventDefault()
          menu(node.data.item, { x: event.clientX, y: event.clientY })
        }}
        onPaneClick={() => menu(null)}
        deleteKeyCode={null}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
export function InitialSituation({ taskId }: { taskId: BlueId }) {
  return <SituationSession key={String(taskId)} taskId={taskId} />
}
function SituationSession({ taskId }: { taskId: BlueId }) {
  const tree = useQuery({
    queryKey: situationKeys.tree(taskId),
    queryFn: ({ signal }) => getSituation(taskId, signal),
    retry: false,
  })
  return (
    <SituationEditor
      tree={tree}
      kind={2}
      save={(data, nodeId, signal) =>
        saveSituation(taskId, data, nodeId, signal)
      }
      remove={(nodeId, signal) => deleteSituation(taskId, nodeId, signal)}
    />
  )
}
export function SituationEditor({
  tree,
  save,
  remove: removeNode,
  kind,
}: {
  tree: UseQueryResult<SituationNode[]>
  save: (
    data: unknown,
    nodeId: BlueId | undefined,
    signal: AbortSignal,
  ) => Promise<void>
  remove: (nodeId: BlueId, signal: AbortSignal) => Promise<void>
  kind: 2 | 3
}) {
  const title = kind === 2 ? '初始态势' : '蓝军数据'
  const signalForPage = usePageSignal()
  const [form, setForm] = useState<{
      editing?: SituationNode
      parent?: SituationNode
    } | null>(null),
    [context, setContext] = useState<{
      node: SituationNode
      x: number
      y: number
    } | null>(null),
    [deleting, setDeleting] = useState<SituationNode | null>(null),
    [busy, setBusy] = useState(false)
  const saved = async () => {
    const result = await tree.refetch()
    if (result.error) throw result.error
  }
  const remove = async () => {
    if (!deleting) return
    const signal = signalForPage()
    setBusy(true)
    try {
      await removeNode(deleting.id, signal)
      if (signal.aborted) return
      await saved()
      if (!signal.aborted) setDeleting(null)
    } catch (error) {
      if (!signal.aborted) blueError(error)
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  return (
    <section className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          disabled={tree.isFetching}
          onClick={() => {
            void tree.refetch()
          }}
        >
          刷新数据
        </Button>
        <Button
          onClick={() => {
            setContext(null)
            setForm({})
          }}
        >
          新增节点
        </Button>
      </div>
      {tree.isPending ? (
        <Loading label={`正在读取${title}…`} />
      ) : tree.isError ? (
        <div role="alert">
          {title}读取失败
          <Button variant="link" onClick={() => void tree.refetch()}>
            重试{title}
          </Button>
        </div>
      ) : tree.data.length ? (
        <SituationGraph
          tree={tree.data}
          menu={(node, point) =>
            setContext(node && point ? { node, ...point } : null)
          }
        />
      ) : (
        <p>暂无态势数据</p>
      )}
      {context && (
        <div
          className="fixed z-40 grid gap-1 rounded border bg-popover p-2 shadow-lg"
          style={{
            left: Math.min(context.x, window.innerWidth - 160),
            top: Math.min(context.y, window.innerHeight - 150),
          }}
        >
          <Button
            variant="ghost"
            onClick={() => {
              setForm({ parent: context.node })
              setContext(null)
            }}
          >
            新增数据
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setForm({ editing: context.node })
              setContext(null)
            }}
          >
            编辑节点
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setDeleting(context.node)
              setContext(null)
            }}
          >
            删除节点
          </Button>
        </div>
      )}
      {form && (
        <SituationForm
          save={save}
          kind={kind}
          editing={form.editing}
          parent={form.parent}
          close={() => setForm(null)}
          saved={saved}
        />
      )}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除节点</AlertDialogTitle>
            <AlertDialogDescription>
              删除当前节点，将会把附带的子节点全部删除，请谨慎操作！
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              取消
            </Button>
            <LoadingButton loading={busy} onClick={() => void remove()}>
              确认删除
            </LoadingButton>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
