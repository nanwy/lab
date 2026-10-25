import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { Button } from '@workspace/ui/components/button'
import { Loading } from '@workspace/ui/components/loading'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from '@workspace/ui/components/field'
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@workspace/ui/components/combobox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import {
  getBlueCandidates,
  importBlueTeam,
  type BlueId,
} from '../api/blue-team'
import { usePageSignal } from '../auth/use-page-signal'
import { blueError } from './feedback'

export function BlueImport({
  experimentId,
  existing,
  close,
  saved,
}: {
  experimentId: BlueId
  existing: boolean
  close: () => void
  saved: () => Promise<void>
}) {
  const [type, setType] = useState<1 | 2>(1)
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const signalForPage = usePageSignal()
  const candidates = useQuery({
    queryKey: ['blue-candidates', type],
    queryFn: ({ signal }) => getBlueCandidates(type, signal),
    retry: false,
  })
  const form = useForm({
    defaultValues: { selected: '' as BlueId },
    validators: {
      onSubmit: z.object({
        selected: z.union([z.string().min(1, '请选择蓝军'), z.number()]),
      }),
    },
    onSubmit: async ({ value }) => {
      const signal = signalForPage()
      await importBlueTeam(experimentId, type, value.selected, existing, signal)
      if (signal.aborted) return
      await saved()
      if (!signal.aborted) close()
    },
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent ref={setContainer}>
        <DialogHeader>
          <DialogTitle>导入模拟蓝军</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit().catch(blueError)
          }}
          className="space-y-5"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="blue-type">蓝军类型</FieldLabel>
              <select
                id="blue-type"
                className="rounded-md border p-2"
                value={type}
                onChange={(event) => {
                  setType(Number(event.target.value) as 1 | 2)
                  form.setFieldValue('selected', '')
                }}
              >
                <option value="1">剧本蓝军</option>
                <option value="2">智能蓝军</option>
              </select>
            </Field>
            <form.Field
              name="selected"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>选择蓝军</FieldLabel>
                    {candidates.isPending ? (
                      <Loading label="正在加载蓝军候选…" variant="inline" />
                    ) : candidates.isError ? (
                      <div role="alert">
                        蓝军候选读取失败
                        <Button
                          type="button"
                          variant="link"
                          onClick={() => void candidates.refetch()}
                        >
                          重试
                        </Button>
                      </div>
                    ) : (
                      <Combobox
                        items={candidates.data}
                        itemToStringLabel={(item) => item.name}
                        value={
                          candidates.data.find(
                            (item) => item.id === field.state.value,
                          ) ?? null
                        }
                        onValueChange={(item) =>
                          field.handleChange(item?.id ?? '')
                        }
                      >
                        <ComboboxInput
                          id={field.name}
                          name={field.name}
                          aria-invalid={isInvalid}
                          onBlur={field.handleBlur}
                        />
                        <ComboboxContent container={container}>
                          <ComboboxEmpty>暂无匹配蓝军</ComboboxEmpty>
                          <ComboboxList>
                            {(item) => (
                              <ComboboxItem key={item.id} value={item}>
                                {item.name}
                              </ComboboxItem>
                            )}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                    )}
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />
          </FieldGroup>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(pending) => (
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={close}
                >
                  取消
                </Button>
                <LoadingButton type="submit" loading={pending}>
                  保存
                </LoadingButton>
              </div>
            )}
          </form.Subscribe>
        </form>
      </DialogContent>
    </Dialog>
  )
}
