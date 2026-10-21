import { useForm, useStore } from '@tanstack/react-form'
import { useEffect } from 'react'
import { z } from 'zod'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from '@workspace/ui/components/field'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { asObject } from '../api/topology-resources'
import type {
  TopologyNode as FullNode,
  TopologyEdge as FullEdge,
  X6Cell,
} from './x6-adapter'
type TopologyNode = Pick<FullNode, 'id' | 'data'>
type TopologyEdge = Pick<FullEdge, 'id' | 'data' | 'source' | 'target'>

export function nicLabel(node: TopologyNode, index: number) {
  const config = asObject(asObject(node.data.raw.data?.nodeInfo).config_info)
  const format = asObject(config.base_info).port_name_format
  if (typeof format === 'string') return format.replace('{}', String(index))
  const port = asObject((config.ports as unknown[])[index])
  return port.nic_type ? `${String(port.nic_type)}/${index}` : String(index)
}
export function nicIndices(node: TopologyNode) {
  const ports = asObject(
    asObject(node.data.raw.data?.nodeInfo).config_info,
  ).ports
  return Array.isArray(ports) ? ports.map((_, index) => index) : []
}
export function occupied(
  nodeId: string,
  index: number,
  edges: TopologyEdge[],
  except?: string,
  passthrough: X6Cell[] = [],
) {
  return [...edges.map((edge) => edge.data.raw), ...passthrough].some(
    (cell) =>
      cell.shape === 'edge' &&
      cell.data?.nodeType !== 'base_element' &&
      cell.id !== except &&
      ((cell.source?.cell === nodeId && cell.data?.source === index) ||
        (cell.target?.cell === nodeId && cell.data?.target === index)),
  )
}
export function LinkConfiguration({
  source,
  nodes,
  edges,
  passthrough = [],
  edge,
  onSave,
  onError,
  onDirtyChange,
}: {
  source: TopologyNode
  nodes: TopologyNode[]
  edges: TopologyEdge[]
  passthrough?: X6Cell[]
  edge?: TopologyEdge
  onSave: (value: {
    target: string
    sourcePort: number
    targetPort: number
    lineType: string
  }) => Promise<void>
  onError: (error: unknown) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const graphical = edge?.data.raw.data?.nodeType === 'base_element'
  const form = useForm({
    defaultValues: {
      target: edge?.target ?? '',
      sourcePort:
        edge?.data.raw.data?.source === undefined
          ? ''
          : String(edge.data.raw.data.source),
      targetPort:
        edge?.data.raw.data?.target === undefined
          ? ''
          : String(edge.data.raw.data.target),
      lineType: String(edge?.data.raw.data?.lineType ?? 'normal'),
    },
    validators: {
      onSubmit: z.object({
        target: z.string().min(1, '请选择目标设备'),
        sourcePort: graphical ? z.string() : z.string().min(1, '请选择源网卡'),
        targetPort: graphical
          ? z.string()
          : z.string().min(1, '请选择目标网卡'),
        lineType: z.string(),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await onSave({
          ...value,
          sourcePort: Number(value.sourcePort),
          targetPort: Number(value.targetPort),
        })
      } catch (error) {
        onError(error)
      }
    },
  })
  const dirty = useStore(form.store, (state) => state.isDirty)
  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        <p>源设备：{source.data.label}</p>
        <form.Field
          name="target"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>目标设备</FieldLabel>
                <select
                  id={field.name}
                  name={field.name}
                  aria-invalid={isInvalid}
                  disabled={Boolean(edge)}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    field.handleChange(event.target.value)
                    form.setFieldValue('targetPort', '')
                  }}
                >
                  <option value="">请选择</option>
                  {nodes
                    .filter(
                      (node) =>
                        node.id !== source.id &&
                        (nicIndices(node).length ||
                          (graphical && node.id === edge?.target)),
                    )
                    .map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.data.label}
                      </option>
                    ))}
                </select>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
        {!graphical ? (
          <form.Subscribe
            selector={(state) => state.values.target}
            children={(target) => {
              const targetNode = nodes.find((node) => node.id === target)
              return (
                <>
                  {(['sourcePort', 'targetPort'] as const).map((name) => (
                    <form.Field
                      key={name}
                      name={name}
                      children={(field) => {
                        const isInvalid =
                          field.state.meta.isTouched &&
                          !field.state.meta.isValid
                        const node = name === 'sourcePort' ? source : targetNode
                        return (
                          <Field data-invalid={isInvalid}>
                            <FieldLabel htmlFor={field.name}>
                              {name === 'sourcePort' ? '源网卡' : '目标网卡'}
                            </FieldLabel>
                            <select
                              id={field.name}
                              name={field.name}
                              disabled={Boolean(edge)}
                              aria-invalid={isInvalid}
                              value={field.state.value}
                              onBlur={field.handleBlur}
                              onChange={(event) =>
                                field.handleChange(event.target.value)
                              }
                            >
                              <option value="">请选择</option>
                              {node
                                ? nicIndices(node).map((index) => (
                                    <option
                                      key={index}
                                      value={index}
                                      disabled={occupied(
                                        node.id,
                                        index,
                                        edges,
                                        edge?.id,
                                        passthrough,
                                      )}
                                    >
                                      {nicLabel(node, index)}
                                      {occupied(
                                        node.id,
                                        index,
                                        edges,
                                        edge?.id,
                                        passthrough,
                                      )
                                        ? '（已占用）'
                                        : ''}
                                    </option>
                                  ))
                                : null}
                            </select>
                            {isInvalid && (
                              <FieldError errors={field.state.meta.errors} />
                            )}
                          </Field>
                        )
                      }}
                    />
                  ))}
                </>
              )
            }}
          />
        ) : null}
        <form.Field
          name="lineType"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>线路类型</FieldLabel>
                <select
                  id={field.name}
                  name={field.name}
                  aria-invalid={isInvalid}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                >
                  <option value="normal">直线</option>
                  <option value="orth">折线</option>
                </select>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
        <form.Subscribe
          selector={(state) => state.isSubmitting}
          children={(isSubmitting) => (
            <LoadingButton type="submit" loading={isSubmitting}>
              {edge ? '保存链路' : '创建链路'}
            </LoadingButton>
          )}
        />
      </FieldGroup>
    </form>
  )
}
