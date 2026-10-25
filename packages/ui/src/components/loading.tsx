import type { ComponentProps } from 'react'
import { cn } from '../lib/utils'
import { Spinner } from './spinner'

export type LoadingProps = Omit<ComponentProps<'div'>, 'children'> & {
  label?: string
  variant?: 'block' | 'inline'
}

/** 请求等待态；表格中放在跨列表格单元格内，业务请求由调用方管理。 */
export function Loading({
  label = '正在加载…',
  variant = 'block',
  className,
  ...props
}: LoadingProps) {
  return (
    <div
      {...props}
      data-slot="loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        'gap-3 text-sm text-muted-foreground',
        variant === 'block'
          ? 'flex min-h-40 w-full flex-col items-center justify-center px-6 py-8'
          : 'inline-flex items-center py-1',
        className,
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
        <Spinner
          aria-hidden="true"
          role="presentation"
          className="size-5 motion-reduce:animate-none"
        />
      </span>
      <span>{label}</span>
    </div>
  )
}
