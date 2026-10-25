import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Loading } from '@workspace/ui/components/loading'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  Field,
  FieldLabel,
  FieldError,
  FieldGroup,
} from '@workspace/ui/components/field'
import type { BlueId } from '../api/blue-team'
import {
  getIntelligentEngines,
  intelligentBase,
  intelligentCommand,
  engineSchema,
  type IntelligentEngine,
} from '../api/blue-intelligent'
import { usePageSignal } from '../auth/use-page-signal'
import { blueError } from './feedback'
const descriptions: Record<string, string> = {
  1: '数据决策是根据所获的数据进行分析和挖掘数据，从而推荐出下一步可执行的动作',
  2: '技战术决策是根据对应的技战术框架和战术先后顺序进行判断和决策，从而推荐出下一步可执行的动作',
  3: '对抗图谱决策是根据整理的知识图谱信息，根据图谱信息挖掘对应的下一步可执行的动作',
  4: '人工干预决策是在决策过程中人为参与相关能力动作的选择，从而进行确定下一步执行的动作',
}
const schema = z.object({
  configs: z.array(engineSchema).superRefine((configs, ctx) => {
    configs.forEach((config, i) => {
      if (
        config.is_enabled &&
        (config.weight == null || config.weight < 0 || config.weight > 1)
      )
        ctx.addIssue({
          code: 'custom',
          message: '权重值必须在0–1之间',
          path: [i, 'weight'],
        })
    })
  }),
})
export function IntelligentEngines({
  intelligentId,
  refreshed,
}: {
  intelligentId: BlueId
  refreshed: () => Promise<unknown>
}) {
  const query = useQuery({
    queryKey: ['intelligent', String(intelligentId), 'engines'],
    queryFn: ({ signal }) => getIntelligentEngines(intelligentId, signal),
    retry: false,
    refetchOnWindowFocus: false,
  })
  return query.isPending ? (
    <Loading label="正在读取决策引擎…" />
  ) : query.isError ? (
    <p role="alert">
      引擎读取失败
      <Button variant="link" onClick={() => void query.refetch()}>
        重试
      </Button>
    </p>
  ) : (
    <EngineForm
      key={query.dataUpdatedAt}
      engines={query.data}
      intelligentId={intelligentId}
      saved={async () => {
        await Promise.all([query.refetch(), refreshed()])
      }}
    />
  )
}
function EngineForm({
  engines,
  intelligentId,
  saved,
}: {
  engines: IntelligentEngine[]
  intelligentId: BlueId
  saved: () => Promise<unknown>
}) {
  const signalForPage = usePageSignal()
  const form = useForm({
    defaultValues: { configs: engines },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      const signal = signalForPage()
      try {
        await intelligentCommand(
          `${intelligentBase(intelligentId)}/decision_engine/`,
          {
            configs: value.configs.map((c) => ({
              engine_type: c.engine_type,
              is_enabled: c.is_enabled,
              weight: c.weight,
            })),
          },
          signal,
        )
        if (!signal.aborted) await saved()
      } catch (e) {
        if (!signal.aborted) blueError(e)
      }
    },
  })
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup className="grid gap-3 md:grid-cols-4">
        {engines.map((engine, i) => (
          <section
            key={String(engine.engine_type)}
            className="space-y-4 rounded border p-4"
          >
            <h3 className="font-semibold">{engine.engine_type_name}</h3>
            <p className="text-sm text-muted-foreground">
              {descriptions[String(engine.engine_type)]}
            </p>
            <form.Field
              name={`configs[${i}].is_enabled`}
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <div className="flex items-center gap-2">
                      <input
                        id={field.name}
                        name={field.name}
                        type="checkbox"
                        aria-invalid={isInvalid}
                        checked={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.checked)}
                      />
                      <FieldLabel htmlFor={field.name}>
                        启用{engine.engine_type_name}
                      </FieldLabel>
                    </div>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />
            <form.Subscribe selector={(s) => s.values.configs[i]?.is_enabled}>
              {(enabled) => (
                <form.Field
                  name={`configs[${i}].weight`}
                  children={(field) => {
                    const isInvalid =
                      field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>
                          {engine.engine_type_name}权重
                        </FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          aria-invalid={isInvalid}
                          disabled={!enabled}
                          type="number"
                          min={0}
                          max={1}
                          step={0.1}
                          value={field.state.value ?? ''}
                          onBlur={field.handleBlur}
                          onChange={(e) =>
                            field.handleChange(
                              e.target.value === ''
                                ? null
                                : Number(e.target.value),
                            )
                          }
                        />
                        {isInvalid && (
                          <FieldError errors={field.state.meta.errors} />
                        )}
                      </Field>
                    )
                  }}
                />
              )}
            </form.Subscribe>
          </section>
        ))}
      </FieldGroup>
      <p className="text-sm text-muted-foreground">
        决策权重值为0–1，越大优先。
      </p>
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(busy) => (
          <LoadingButton type="submit" loading={busy}>
            保存引擎配置
          </LoadingButton>
        )}
      </form.Subscribe>
    </form>
  )
}
