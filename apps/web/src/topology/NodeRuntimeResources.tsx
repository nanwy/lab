import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { LoadingButton } from '@workspace/ui/components/loading-button'
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
  AlertDialogCancel,
} from '@workspace/ui/components/alert-dialog'
import { toast } from '@workspace/ui/components/sonner'
import { ActivityTable, ListPagination } from '../activity/ActivityTable'
import {
  getNodeDefinitions,
  asObject,
  type ObjectValue,
  type ConfigSchema,
} from '../api/topology-resources'
import {
  getSnapshots,
  createSnapshot,
  changeSnapshot,
  getNatRules,
  createNatRule,
  deleteNatRule,
  getConversionTemplates,
  getRuntimeImage,
  type Snapshot,
  type NatRule,
} from '../api/node-runtime-resources'
import { RuntimeResourceForm } from './RuntimeResourceForm'
import { NodeImageForm } from './NodeImageForm'
import type { TopologyNode } from './x6-adapter'

export type NodeResourceMode =
  'snapshot' | 'nat' | 'convert' | 'image' | 'detail'
type Props = {
  id: string | number
  node: Pick<TopologyNode, 'id' | 'data'>
  mode: NodeResourceMode
  status: number
  busy: boolean
  signal: () => AbortSignal
  onDirtyChange: (dirty: boolean) => void
  close: () => void
  run: (work: () => Promise<unknown>) => Promise<void>
  convert: (template: ObjectValue) => Promise<void>
  onError: (error: unknown) => void
}
const titles: Record<NodeResourceMode, string> = {
  snapshot: '快照列表',
  nat: 'NAT网络',
  convert: '节点转换',
  image: '保存镜像',
  detail: '节点详情',
}

export function NodeRuntimeResources(props: Props) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !props.busy) props.close()
      }}
    >
      <DialogContent
        className="max-h-[85vh] overflow-auto sm:max-w-3xl"
        onInteractOutside={(event) => {
          if (props.busy) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          if (props.busy) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>{titles[props.mode]}</DialogTitle>
          <DialogDescription>{props.node.data.label}</DialogDescription>
        </DialogHeader>
        {props.mode === 'snapshot' || props.mode === 'nat' ? (
          <ResourceList {...props} mode={props.mode} />
        ) : props.mode === 'convert' ? (
          <Conversion {...props} />
        ) : (
          <ImageResource {...props} />
        )}
      </DialogContent>
    </Dialog>
  )
}
function ResourceList(props: Props & { mode: 'snapshot' | 'nat' }) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [ordering, setOrdering] = useState('')
  const [adding, setAdding] = useState(false)
  const [confirmation, setConfirmation] = useState<{
    label: string
    description: string
    action: () => Promise<void>
  } | null>(null)
  const snapshots = props.mode === 'snapshot'
  const filter = { page, search, ordering }
  const list = useQuery<{ count: number; results: Array<Snapshot | NatRule> }>({
    queryKey: ['node-resources', props.id, props.node.id, props.mode, filter],
    queryFn: ({ signal }) =>
      snapshots
        ? getSnapshots(props.id, props.node.id, filter, signal)
        : getNatRules(props.id, props.node.id, filter, signal),
    retry: false,
    gcTime: 0,
  })
  async function refreshAfter(work: () => Promise<unknown>, deleting = false) {
    await props.run(work)
    if (props.signal().aborted) return
    setAdding(false)
    if (deleting && page > 1 && list.data?.results.length === 1)
      setPage(page - 1)
    else await list.refetch()
  }
  const ask = (
    label: string,
    description: string,
    work: () => Promise<unknown>,
    deleting = false,
  ) =>
    setConfirmation({
      label,
      description,
      action: async () => {
        await refreshAfter(work, deleting)
        setConfirmation(null)
      },
    })
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label={snapshots ? '搜索快照' : '搜索NAT'}
          maxLength={300}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
        {snapshots ? (
          <Button
            variant="outline"
            onClick={() => {
              setOrdering(
                ordering === 'create_time' ? '-create_time' : 'create_time',
              )
              setPage(1)
            }}
          >
            创建时间排序
          </Button>
        ) : null}
        <Button
          disabled={props.busy}
          onClick={() => {
            if (snapshots && [0, 1, 3].includes(props.status)) {
              toast.error(
                `节点${{ 0: '未启动', 1: '启动中', 3: '启动失败' }[props.status]}，无法创建快照`,
              )
              return
            }
            setAdding(true)
          }}
        >
          {snapshots ? '创建快照' : '添加NAT网络'}
        </Button>
      </div>
      {adding ? (
        <>
          <RuntimeResourceForm
            key={props.mode}
            onDirtyChange={props.onDirtyChange}
            initial={
              snapshots
                ? { name: '' }
                : { nat_type: '', external_ip: '', logical_ip: '' }
            }
            fields={
              snapshots
                ? [{ name: 'name', label: '快照名称', maxLength: 32 }]
                : [
                    {
                      name: 'nat_type',
                      label: 'nat类型',
                      options: ['snat', 'dnat', 'dnat_and_snat'].map(
                        (value) => ({ value, label: value }),
                      ),
                    },
                    { name: 'external_ip', label: '外部IP' },
                    { name: 'logical_ip', label: '内部IP' },
                  ]
            }
            schema={
              snapshots
                ? z.object({ name: z.string().max(32) })
                : z.object({
                    nat_type: z.string().min(1, '请选择nat类型'),
                    external_ip: z.string().min(1, '请输入外部IP'),
                    logical_ip: z.string().min(1, '请输入内部IP'),
                  })
            }
            label={snapshots ? '保存快照' : '保存NAT'}
            submit={(value) =>
              refreshAfter(() =>
                snapshots
                  ? createSnapshot(
                      props.id,
                      props.node.id,
                      value.name!,
                      props.signal(),
                    )
                  : createNatRule(
                      props.id,
                      props.node.id,
                      value,
                      props.signal(),
                    ),
              )
            }
          />
          <Button
            variant="outline"
            disabled={props.busy}
            onClick={() => setAdding(false)}
          >
            取消新增
          </Button>
        </>
      ) : null}
      {list.isPending ? (
        <p role="status">正在加载…</p>
      ) : list.isError ? (
        <div role="alert">
          资源读取失败
          <Button onClick={() => void list.refetch()}>重试资源</Button>
        </div>
      ) : snapshots ? (
        <ActivityTable<Snapshot>
          data={list.data.results as Snapshot[]}
          name="快照列表"
          empty="暂无快照"
          columns={[
            { header: '快照名称', accessorKey: 'name' },
            {
              header: '是否启用',
              cell: ({ row }) => (row.original.enable ? '已启动' : '未启用'),
            },
            { header: '创建时间', accessorKey: 'create_time' },
            {
              header: '操作',
              cell: ({ row: { original: item } }) => (
                <>
                  <Button
                    variant="link"
                    disabled={props.busy || item.enable}
                    onClick={() =>
                      ask('恢复快照', '恢复快照将覆盖当前环境', () =>
                        changeSnapshot(
                          props.id,
                          props.node.id,
                          item.id,
                          false,
                          props.signal(),
                        ),
                      )
                    }
                  >
                    恢复
                  </Button>
                  <Button
                    variant="link"
                    disabled={props.busy}
                    onClick={() =>
                      ask(
                        '删除快照',
                        '确定要删除快照？',
                        () =>
                          changeSnapshot(
                            props.id,
                            props.node.id,
                            item.id,
                            true,
                            props.signal(),
                          ),
                        true,
                      )
                    }
                  >
                    删除
                  </Button>
                </>
              ),
            },
          ]}
        />
      ) : (
        <ActivityTable<NatRule>
          data={list.data.results as NatRule[]}
          name="NAT网络"
          empty="暂无NAT网络"
          columns={[
            { header: 'nat类型', accessorKey: 'nat_type' },
            { header: '外部IP', accessorKey: 'external_ip' },
            { header: '内部IP', accessorKey: 'logical_ip' },
            {
              header: '操作',
              cell: ({ row: { original: item } }) => (
                <Button
                  variant="link"
                  disabled={props.busy}
                  onClick={() =>
                    ask(
                      '删除NAT网络',
                      '确认删除当前NAT网络？',
                      () =>
                        deleteNatRule(
                          props.id,
                          props.node.id,
                          item.id,
                          props.signal(),
                        ),
                      true,
                    )
                  }
                >
                  删除
                </Button>
              ),
            },
          ]}
        />
      )}
      <ListPagination
        page={page}
        size={10}
        count={list.data?.count ?? 0}
        change={setPage}
        busy={props.busy || list.isFetching}
      />
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !props.busy) setConfirmation(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.label}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel disabled={props.busy}>取消</AlertDialogCancel>
          <LoadingButton
            loading={props.busy}
            onClick={confirmation?.action}
            onError={props.onError}
          >
            确认
          </LoadingButton>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
function Conversion(props: Props) {
  const info = asObject(props.node.data.raw.data?.nodeInfo)
  const templates = useQuery({
    queryKey: ['node-conversion', props.node.id],
    queryFn: ({ signal }) => getConversionTemplates(info, signal),
    retry: false,
    gcTime: 0,
  })
  if (templates.isPending) return <p role="status">正在加载节点模板…</p>
  if (templates.isError)
    return (
      <div role="alert">
        模板读取失败
        <Button onClick={() => void templates.refetch()}>重试模板</Button>
      </div>
    )
  return (
    <RuntimeResourceForm
      onDirtyChange={props.onDirtyChange}
      initial={{ template: '' }}
      fields={[
        {
          name: 'template',
          label: '转换节点',
          searchable: true,
          options: templates.data.map((item) => ({
            value: String(item.id),
            label: item.name,
          })),
        },
      ]}
      schema={z.object({ template: z.string().min(1, '请选择需要转换的节点') })}
      label="确认转换"
      submit={async (value) => {
        const template = templates.data.find(
          (item) => String(item.id) === value.template,
        )
        if (template) await props.convert(template)
      }}
    />
  )
}
function ImageResource(props: Props) {
  const info = asObject(props.node.data.raw.data?.nodeInfo),
    config = asObject(info.config_info),
    base = asObject(config.base_info),
    imageId = base.images_id
  const image = useQuery({
    queryKey: ['runtime-image', imageId],
    queryFn: ({ signal }) =>
      getRuntimeImage(imageId as string | number, signal),
    enabled: typeof imageId === 'string' || typeof imageId === 'number',
    retry: false,
    gcTime: 0,
  })
  const definitions = useQuery({
    queryKey: ['node-definitions'],
    queryFn: ({ signal }) => getNodeDefinitions(signal),
    enabled: props.mode === 'detail',
    retry: false,
  })
  if (
    imageId != null &&
    typeof imageId !== 'string' &&
    typeof imageId !== 'number'
  )
    return <p role="alert">镜像标识无效</p>
  if (imageId !== undefined && imageId !== null && image.isPending)
    return <p role="status">正在读取镜像…</p>
  if (image.isError || definitions.isError)
    return (
      <div role="alert">
        详情读取失败
        <Button
          onClick={() => {
            void image.refetch()
            if (props.mode === 'detail') void definitions.refetch()
          }}
        >
          重试详情
        </Button>
      </div>
    )
  if (props.mode === 'image')
    return image.data ? (
      <NodeImageForm
        image={image.data}
        id={props.id}
        uuid={props.node.id}
        run={props.run}
        signal={props.signal}
        close={props.close}
        onDirtyChange={props.onDirtyChange}
      />
    ) : (
      <p role="alert">当前节点未关联镜像，请重新选择镜像！</p>
    )
  return (
    <>
      {definitions.isPending ? (
        <p role="status">正在读取配置定义…</p>
      ) : !definitions.data?.[String(info.engin)] ? (
        <p>当前设备没有配置定义</p>
      ) : (
        <ConfigurationDetails
          schema={definitions.data[String(info.engin)]!}
          value={config}
        />
      )}
      {image.data ? (
        <>
          <h3>镜像配置</h3>
          {[
            'system_user',
            'app_user',
            ...(image.data.ip_type === 2 ? ['ip_config'] : []),
          ].map((key) => (
            <section key={key}>
              <h4>
                {
                  {
                    system_user: '系统账号密码',
                    app_user: '应用账号密码',
                    ip_config: 'IP配置',
                  }[key]
                }
              </h4>
              {(image.data![key] as ObjectValue[]).map((row, index) => (
                <p key={index}>
                  {(key === 'ip_config'
                    ? ['ip', 'subnet_mask', 'gateway']
                    : ['username', 'password']
                  )
                    .map((name) => `${name}：${String(row[name] ?? '')}`)
                    .join('；')}
                </p>
              ))}
            </section>
          ))}
          <p>启动配置：{image.data.start_config || '暂无'}</p>
          <p>镜像描述：{image.data.desc || '暂无描述'}</p>
        </>
      ) : null}
    </>
  )
}
function ConfigurationDetails({
  schema,
  value,
}: {
  schema: ConfigSchema
  value: unknown
}) {
  if (schema.type === 'array')
    return (
      <div>
        {(Array.isArray(value) ? value : []).map((item, index) => (
          <section key={index}>
            <h4>第{index + 1}项</h4>
            <ConfigurationDetails schema={schema.items ?? {}} value={item} />
          </section>
        ))}
      </div>
    )
  if (schema.properties)
    return (
      <dl className="space-y-2">
        {Object.entries(schema.properties)
          .filter(([key]) => key !== '_config')
          .map(([key, definition]) => (
            <div key={key}>
              <dt>{definition.description || key}</dt>
              <dd>
                <ConfigurationDetails
                  schema={definition}
                  value={
                    asObject(value)[key] === undefined
                      ? definition.default
                      : asObject(value)[key]
                  }
                />
              </dd>
            </div>
          ))}
      </dl>
    )
  return (
    <span>
      {value === undefined || value === null
        ? '—'
        : typeof value === 'boolean'
          ? value
            ? '是'
            : '否'
          : String(value)}
    </span>
  )
}
