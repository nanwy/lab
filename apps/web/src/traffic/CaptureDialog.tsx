import { useQuery } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@workspace/ui/components/dialog'
import {
  Field,
  FieldLabel,
  FieldError,
  FieldGroup,
} from '@workspace/ui/components/field'
import { Input } from '@workspace/ui/components/input'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { toast } from '@workspace/ui/components/sonner'
import {
  CaptureRecords,
  captureError,
  useCaptureRecordsState,
} from './CaptureRecords'
import { Button } from '@workspace/ui/components/button'
import { useState } from 'react'
import {
  getCaptureConfig,
  setCapture,
  captureStatusLabels,
  type CaptureConfig,
} from '../api/traffic-capture'
import { usePageSignal } from '../auth/use-page-signal'

export function CaptureDialog({
  id,
  edgeId,
  close,
}: {
  id: string | number
  edgeId: string | number
  close: () => void
}) {
  const recordsState = useCaptureRecordsState()
  const [tab, setTab] = useState<'config' | 'records'>('config')
  const config = useQuery({
    queryKey: ['capture', id, edgeId],
    queryFn: ({ signal }) => getCaptureConfig(id, edgeId, signal),
    retry: false,
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent
        className="max-h-[85vh] overflow-auto sm:max-w-4xl"
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>流量标记</DialogTitle>
          <DialogDescription>
            说明：流量标记会拦截该通信链路的所有流量
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button
            variant={tab === 'config' ? 'default' : 'outline'}
            onClick={() => {
              if (tab !== 'config') {
                setTab('config')
                void config.refetch()
              }
            }}
          >
            标记配置
          </Button>
          <Button
            variant={tab === 'records' ? 'default' : 'outline'}
            onClick={() => setTab('records')}
          >
            流量记录
          </Button>
        </div>
        {tab === 'records' ? (
          <CaptureRecords
            key={`${id}:${edgeId}`}
            id={id}
            edgeId={edgeId}
            state={recordsState}
          />
        ) : config.isPending ? (
          <p role="status">正在加载标记配置…</p>
        ) : config.isError ? (
          <p role="alert">标记配置读取失败：{config.error.message}</p>
        ) : (
          <CaptureForm
            key={`${id}:${edgeId}:${JSON.stringify(config.data)}`}
            id={id}
            edgeId={edgeId}
            config={config.data}
            refresh={() => config.refetch()}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
function CaptureForm({
  id,
  edgeId,
  config,
  refresh,
}: {
  id: string | number
  edgeId: string | number
  config: CaptureConfig
  refresh: () => Promise<unknown>
}) {
  const signal = usePageSignal()
  const form = useForm({
    defaultValues: {
      proto: config.pcap_filter.proto,
      host: config.pcap_filter.host,
      port: config.pcap_filter.port,
      pcap_size: String(config.pcap_size),
    },
    validators: {
      onSubmit: z.object({
        proto: z.string(),
        host: z.string(),
        port: z.string(),
        pcap_size: z
          .string()
          .min(1, '请输入包大小')
          .refine((v) => !v || Number(v) >= 1, '包大小最小为1'),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await setCapture(
          id,
          edgeId,
          {
            pcap_size: value.pcap_size,
            pcap_filter: {
              proto: value.proto,
              host: value.host,
              port: value.port,
            },
          },
          signal(),
        )
        if (!signal().aborted) {
          toast.success('开启成功！')
          await refresh()
        }
      } catch (error) {
        captureError(error)
      }
    },
  })
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
      className="space-y-4"
    >
      <FieldGroup>
        <form.Field
          name="proto"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>协议类型</FieldLabel>
                <select
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                  className="rounded border p-2"
                >
                  <option value="">请选择协议类型</option>
                  {[
                    'tcp',
                    'udp',
                    'icmp',
                    'ip',
                    'arp',
                    'icmp6',
                    'ip6',
                    'ip multicast',
                    'ip broadcast',
                    'rarp',
                  ].map((proto) => (
                    <option key={proto}>{proto}</option>
                  ))}
                </select>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
        <form.Field
          name="host"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>IP地址</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
        <form.Field
          name="port"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>端口</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
        <form.Field
          name="pcap_size"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>每个包大小</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="number"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                />
                <span>M</span>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
      </FieldGroup>
      <p>标记状态：{captureStatusLabels[config.status]}</p>
      {config.status === 2 ? (
        <LoadingButton
          variant="destructive"
          onError={captureError}
          onClick={async () => {
            await setCapture(id, edgeId, undefined, signal())
            if (!signal().aborted) {
              toast.success('停止成功！')
              await refresh()
            }
          }}
        >
          停止
        </LoadingButton>
      ) : (
        <form.Subscribe
          selector={(state) => state.isSubmitting}
          children={(isSubmitting) => (
            <LoadingButton type="submit" loading={isSubmitting}>
              开启
            </LoadingButton>
          )}
        />
      )}
    </form>
  )
}
