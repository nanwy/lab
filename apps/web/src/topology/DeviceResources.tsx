import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import {
  getTopologyResources,
  type DeviceResource,
} from '../api/topology-resources'

const classifications: Record<string, string> = {
  '1': '数字节点',
  '2': '仿真节点',
  '3': '实物节点',
  '4': '空白节点',
  '7': '我的节点',
}
type ResourceGroup = {
  name: string
  items: DeviceResource[]
  children?: ResourceGroup[]
}
const basicElements: DeviceResource[] = [
  {
    id: 'basic-person',
    name: '人员',
    nodeType: 'base_element',
    type: 2,
    logo: '/topology/person.svg',
  },
  { id: 'basic-text', name: '文本框', nodeType: 'base_element', type: 3 },
  {
    id: 'basic-area',
    name: '区域',
    nodeType: 'base_element',
    type: 1,
    className: 'area-node',
  },
]
const positions: DeviceResource[] = [
  '安全检测岗',
  '日常运维岗',
  '应急响应岗',
  '安全管理岗',
  '渗透测试岗',
  '自定义岗位',
].map((name, index) => ({
  id: `position-${index}`,
  name,
  nodeType: 'base_element',
  type: 2,
  logo: '/topology/position.svg',
}))
export function DeviceResources({
  onChoose,
  disabled,
}: {
  onChoose: (resource: DeviceResource) => void
  disabled: boolean
}) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 200)
    return () => clearTimeout(timer)
  }, [search])
  const resources = useQuery({
    queryKey: ['topology-resources', query],
    queryFn: ({ signal }) => getTopologyResources(query, signal),
    retry: false,
  })
  const groups: ResourceGroup[] = []
  if (resources.data) {
    if (resources.data.recent.length)
      groups.push({ name: '最近使用', items: resources.data.recent })
    if (resources.data.personal.length)
      groups.push({ name: '我的节点', items: resources.data.personal })
    for (const [name, items] of [
      ['基本元素', basicElements],
      ['防御岗位', positions],
    ] as const) {
      const matches = items.filter((item) => item.name.includes(query))
      if (matches.length) groups.push({ name, items: matches })
    }
    for (const item of resources.data.templates.toSorted(
      (a, b) =>
        Number(a.classify) - Number(b.classify) ||
        (a.device_type_order ?? 0) - (b.device_type_order ?? 0) ||
        (a.icon_classify_order ?? 0) - (b.icon_classify_order ?? 0),
    )) {
      const name =
        classifications[String(item.classify)] ?? String(item.classify)
      let group = groups.find((group) => group.name === name && group.children)
      if (!group) {
        group = { name, items: [], children: [] }
        groups.push(group)
      }
      const subtype = item.device_type_name ?? String(item.device_type)
      const child = group.children!.find((child) => child.name === subtype)
      if (child) child.items.push(item)
      else group.children!.push({ name: subtype, items: [item] })
    }
  }
  function renderItems(items: DeviceResource[]) {
    return (
      <div className="grid gap-2 pt-2">
        {items.map((resource, index) => (
          <Button
            key={`${resource.id}:${index}`}
            variant="outline"
            disabled={disabled}
            draggable={!disabled}
            onClick={() => onChoose(resource)}
            onDragStart={(event) =>
              event.dataTransfer.setData(
                'application/x-topology-resource',
                JSON.stringify(resource),
              )
            }
          >
            {resource.name}
          </Button>
        ))}
      </div>
    )
  }
  return (
    <aside aria-label="设备资源" className="w-56 shrink-0 space-y-3 border p-3">
      <h3>设备资源</h3>
      <Input
        aria-label="搜索设备"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {resources.isPending ? (
        <p role="status">正在加载设备…</p>
      ) : resources.isError ? (
        <div role="alert">
          <p>设备资源读取失败</p>
          <Button onClick={() => void resources.refetch()}>重试设备资源</Button>
        </div>
      ) : groups.length === 0 ? (
        <p>暂无设备资源</p>
      ) : null}
      {groups.map((group) => (
        <details open key={group.name}>
          <summary>{group.name}</summary>
          {renderItems(group.items)}
          {group.children?.map((child) => (
            <details open key={child.name} className="ml-2">
              <summary>{child.name}</summary>
              {renderItems(child.items)}
            </details>
          ))}
        </details>
      ))}
      <p className="text-xs text-muted-foreground">
        拖入画布，或点选设备后点击画布放置。
      </p>
    </aside>
  )
}
