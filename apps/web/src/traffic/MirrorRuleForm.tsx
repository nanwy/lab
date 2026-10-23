import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { Button } from '@workspace/ui/components/button'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldError,
} from '@workspace/ui/components/field'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@workspace/ui/components/sheet'
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@workspace/ui/components/combobox'
import {
  NativeSelect,
  NativeSelectOption,
} from '@workspace/ui/components/native-select'
import { toast } from '@workspace/ui/components/sonner'
import {
  createMirrorRule,
  getMirrorNodes,
  mirrorInputSchema,
} from '../api/traffic-mirroring'
import { usePageSignal } from '../auth/use-page-signal'
import { captureError } from './CaptureRecords'

export function MirrorRuleForm({
  id,
  close,
  refresh,
}: {
  id: string | number
  close: () => void
  refresh: () => Promise<unknown>
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const signal = usePageSignal()
  const nodes = useQuery({
    queryKey: ['mirror-nodes', id],
    queryFn: ({ signal }) => getMirrorNodes(id, signal),
    retry: false,
    gcTime: 0,
  })
  const form = useForm({
    defaultValues: { src_node: 0, src_tap: '', dst_node: 0, dst_tap: '' },
    validators: { onSubmit: mirrorInputSchema },
    onSubmit: async ({ value }) => {
      try {
        await createMirrorRule(id, value, signal())
        if (signal().aborted) return
        toast.success('创建成功！')
        close()
        await refresh()
      } catch (error) {
        captureError(error)
      }
    },
  })
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <SheetContent
        ref={setContainer}
        className="w-full overflow-y-auto sm:max-w-3xl"
      >
        <SheetHeader>
          <SheetTitle>流量镜像规则</SheetTitle>
          <SheetDescription>配置源节点和目标节点的 TAP 网卡</SheetDescription>
        </SheetHeader>
        {nodes.isPending ? (
          <p role="status">正在加载节点…</p>
        ) : nodes.isError ? (
          <p role="alert">{nodes.error.message}</p>
        ) : (
          <form
            className="p-4"
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            <FieldGroup>
              <form.Field
                name="src_node"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>源节点</FieldLabel>
                      <Combobox
                        items={nodes.data}
                        itemToStringLabel={(node) => node.name}
                        value={
                          nodes.data.find(
                            (node) => node.id === field.state.value,
                          ) ?? null
                        }
                        onValueChange={(node) => {
                          field.handleChange(node?.id ?? 0)
                          form.setFieldValue('src_tap', '')
                        }}
                      >
                        <ComboboxInput
                          id={field.name}
                          name={field.name}
                          aria-invalid={isInvalid}
                          onBlur={field.handleBlur}
                          showClear
                          placeholder="请选择源节点"
                        />
                        <ComboboxContent container={container}>
                          <ComboboxEmpty>暂无节点</ComboboxEmpty>
                          <ComboboxList>
                            {(node) => (
                              <ComboboxItem key={node.id} value={node}>
                                {node.name}
                              </ComboboxItem>
                            )}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  )
                }}
              />
              <form.Subscribe
                selector={(state) =>
                  [state.values.src_node, state.values.dst_tap] as const
                }
              >
                {([nodeId, otherTap]) => (
                  <form.Field
                    name="src_tap"
                    children={(field) => {
                      const isInvalid =
                        field.state.meta.isTouched && !field.state.meta.isValid
                      return (
                        <Field data-invalid={isInvalid}>
                          <FieldLabel htmlFor={field.name}>
                            源节点TAP网卡
                          </FieldLabel>
                          <NativeSelect
                            id={field.name}
                            name={field.name}
                            aria-invalid={isInvalid}
                            disabled={!nodeId}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                          >
                            <NativeSelectOption value="">
                              请选择源节点TAP网卡
                            </NativeSelectOption>
                            {nodes.data
                              .find((node) => node.id === nodeId)
                              ?.node_tap_list.map((tap) => (
                                <NativeSelectOption
                                  key={tap}
                                  value={tap}
                                  disabled={tap === otherTap}
                                >
                                  {tap}
                                </NativeSelectOption>
                              ))}
                          </NativeSelect>
                          {isInvalid && (
                            <FieldError errors={field.state.meta.errors} />
                          )}
                        </Field>
                      )
                    }}
                  />
                )}
              </form.Subscribe>
              <form.Field
                name="dst_node"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>目标节点</FieldLabel>
                      <Combobox
                        items={nodes.data}
                        itemToStringLabel={(node) => node.name}
                        value={
                          nodes.data.find(
                            (node) => node.id === field.state.value,
                          ) ?? null
                        }
                        onValueChange={(node) => {
                          field.handleChange(node?.id ?? 0)
                          form.setFieldValue('dst_tap', '')
                        }}
                      >
                        <ComboboxInput
                          id={field.name}
                          name={field.name}
                          aria-invalid={isInvalid}
                          onBlur={field.handleBlur}
                          showClear
                          placeholder="请选择目标节点"
                        />
                        <ComboboxContent container={container}>
                          <ComboboxEmpty>暂无节点</ComboboxEmpty>
                          <ComboboxList>
                            {(node) => (
                              <ComboboxItem key={node.id} value={node}>
                                {node.name}
                              </ComboboxItem>
                            )}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  )
                }}
              />
              <form.Subscribe
                selector={(state) =>
                  [state.values.dst_node, state.values.src_tap] as const
                }
              >
                {([nodeId, otherTap]) => (
                  <form.Field
                    name="dst_tap"
                    children={(field) => {
                      const isInvalid =
                        field.state.meta.isTouched && !field.state.meta.isValid
                      return (
                        <Field data-invalid={isInvalid}>
                          <FieldLabel htmlFor={field.name}>
                            目标节点TAP网卡
                          </FieldLabel>
                          <NativeSelect
                            id={field.name}
                            name={field.name}
                            aria-invalid={isInvalid}
                            disabled={!nodeId}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                          >
                            <NativeSelectOption value="">
                              请选择目标节点TAP网卡
                            </NativeSelectOption>
                            {nodes.data
                              .find((node) => node.id === nodeId)
                              ?.node_tap_list.map((tap) => (
                                <NativeSelectOption
                                  key={tap}
                                  value={tap}
                                  disabled={tap === otherTap}
                                >
                                  {tap}
                                </NativeSelectOption>
                              ))}
                          </NativeSelect>
                          {isInvalid && (
                            <FieldError errors={field.state.meta.errors} />
                          )}
                        </Field>
                      )
                    }}
                  />
                )}
              </form.Subscribe>
              <div className="flex justify-end gap-2">
                <Button variant="outline" type="button" onClick={close}>
                  取消
                </Button>
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(submitting) => (
                    <LoadingButton type="submit" loading={submitting}>
                      保存
                    </LoadingButton>
                  )}
                </form.Subscribe>
              </div>
            </FieldGroup>
          </form>
        )}
      </SheetContent>
    </Sheet>
  )
}
