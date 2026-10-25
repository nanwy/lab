import { useQuery } from '@tanstack/react-query'
import { Loading } from '@workspace/ui/components/loading'
import { Button } from '@workspace/ui/components/button'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@workspace/ui/components/tabs'
import {
  getScriptDetail,
  scriptKeys,
  type ScriptGraph,
} from '../api/blue-script'
import type { BlueId } from '../api/blue-team'
import { ScriptTerminals } from './ScriptTerminals'
import { ScriptCanvas } from './ScriptCanvas'
export function ScriptConfiguration({ scenarioId }: { scenarioId: BlueId }) {
  return <ScriptSession key={String(scenarioId)} scenarioId={scenarioId} />
}
function ScriptSession({ scenarioId }: { scenarioId: BlueId }) {
  const detail = useQuery({
    queryKey: scriptKeys.detail(scenarioId),
    queryFn: ({ signal }) => getScriptDetail(scenarioId, signal),
    retry: false,
  })
  if (detail.isPending) return <Loading label="正在读取剧本详情…" />
  if (detail.isError)
    return (
      <div role="alert">
        剧本详情读取失败
        <Button variant="link" onClick={() => void detail.refetch()}>
          重试剧本详情
        </Button>
      </div>
    )
  return (
    <Tabs defaultValue="draw">
      <TabsList>
        <TabsTrigger value="draw">剧本指令</TabsTrigger>
        <TabsTrigger value="terminals">蓝军终端</TabsTrigger>
      </TabsList>
      <TabsContent value="draw">
        <ScriptCanvas scenarioId={detail.data.id} />
      </TabsContent>
      <TabsContent value="terminals">
        <ScriptTerminals scenarioId={detail.data.id} />
      </TabsContent>
    </Tabs>
  )
}
// 配置弹窗成功后的图更新保留未知字段，所有写入均归当前剧本。
export type ScriptGraphChange = (
  update: (graph: ScriptGraph) => ScriptGraph,
) => Promise<void>
