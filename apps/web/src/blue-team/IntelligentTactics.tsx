import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@workspace/ui/components/button'
import { Loading } from '@workspace/ui/components/loading'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import type { BlueId } from '../api/blue-team'
import { getIntelligentTactics } from '../api/blue-intelligent'
import { getAbility } from '../api/blue-script'
import { ParameterSample } from './ScriptActionConfig'
export function IntelligentTactics({
  intelligentId,
}: {
  intelligentId: BlueId
}) {
  const [ability, setAbility] = useState<BlueId | null>(null),
    [expanded, setExpanded] = useState<string[]>([])
  const tactics = useQuery({
    queryKey: ['intelligent', String(intelligentId), 'tactics'],
    queryFn: ({ signal }) => getIntelligentTactics(intelligentId, signal),
    retry: false,
  })
  return (
    <section>
      {tactics.isPending ? (
        <Loading label="正在读取技战术…" />
      ) : tactics.isError ? (
        <p role="alert">
          技战术读取失败
          <Button variant="link" onClick={() => void tactics.refetch()}>
            重试
          </Button>
        </p>
      ) : tactics.data.length ? (
        <div className="flex gap-3 overflow-auto">
          {tactics.data.map((t, i) => (
            <section
              key={`${t.name}-${i}`}
              className="min-w-52 flex-1 space-y-3 rounded border p-3"
            >
              <h3 className="text-center font-semibold">{t.name}</h3>
              <p className="text-center text-sm">{t.child.length}个技术</p>
              {t.child.map((tech, j) => {
                const id = `${i}-${j}`,
                  count = tech.child.filter((a) => a.is_exists).length
                return (
                  <div key={id}>
                    <Button
                      variant="outline"
                      className={
                        count
                          ? 'w-full bg-orange-100 text-foreground'
                          : 'w-full'
                      }
                      aria-expanded={expanded.includes(id)}
                      disabled={!tech.child.length}
                      onClick={() =>
                        setExpanded((v) =>
                          v.includes(id)
                            ? v.filter((x) => x !== id)
                            : [...v, id],
                        )
                      }
                    >
                      {tech.name}
                      {count ? ` (已导入${count}个)` : ''}
                    </Button>
                    {expanded.includes(id) && (
                      <ul className="ml-3 border-l pl-2">
                        {tech.child.map((a) => (
                          <li key={a.id}>
                            <Button
                              variant="ghost"
                              className={
                                a.is_exists
                                  ? 'bg-orange-100 text-foreground'
                                  : ''
                              }
                              onClick={() => setAbility(a.id)}
                            >
                              {a.name}
                              {a.instruction_count > 0
                                ? ` (${a.instruction_count}条指令)`
                                : ''}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      ) : (
        <p>暂无技战术</p>
      )}
      {ability != null && (
        <AbilityDetail
          key={String(ability)}
          id={ability}
          close={() => setAbility(null)}
        />
      )}
    </section>
  )
}
function AbilityDetail({ id, close }: { id: BlueId; close: () => void }) {
  const query = useQuery({
    queryKey: ['ability', String(id)],
    queryFn: ({ signal }) => getAbility(id, signal),
    retry: false,
    gcTime: 0,
  })
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) close()
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>能力动作详情</DialogTitle>
        </DialogHeader>
        {query.isPending ? (
          <Loading label="正在读取能力详情…" />
        ) : query.isError ? (
          <p role="alert">
            能力详情读取失败
            <Button variant="link" onClick={() => void query.refetch()}>
              重试
            </Button>
          </p>
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt>能力动作名称</dt>
                <dd>{query.data.name}</dd>
              </div>
              <div>
                <dt>能力动作标识</dt>
                <dd>{query.data.sign || '--'}</dd>
              </div>
              <div className="col-span-2">
                <dt>能力动作描述</dt>
                <dd>{query.data.desc || '--'}</dd>
              </div>
              <div>
                <dt>所属技术</dt>
                <dd>
                  {query.data.tactics_name || '--'} /{' '}
                  {query.data.technology_name || '--'}
                </dd>
              </div>
              <div>
                <dt>攻击样式</dt>
                <dd>{query.data.attack_style_display || '--'}</dd>
              </div>
            </dl>
            <ParameterSample
              showFields={false}
              title="输入参数"
              parameters={query.data.input_params}
            />
            <ParameterSample
              showFields={false}
              title="输出参数"
              parameters={query.data.output_params}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
