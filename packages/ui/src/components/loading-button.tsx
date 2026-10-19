import { useState, type ComponentProps, type MouseEvent } from 'react'

import { Button } from './button'
import { Spinner } from './spinner'

export type LoadingButtonProps = Omit<
  ComponentProps<typeof Button>,
  'onClick' | 'onError' | 'asChild'
> & {
  loading?: boolean
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<unknown>
  /** 异步点击失败时由调用方处理；未提供时交给浏览器的全局错误处理。 */
  onError?: (error: unknown) => void
}

export function LoadingButton({
  loading = false,
  disabled = false,
  type = 'button',
  onClick,
  onError,
  children,
  ...props
}: LoadingButtonProps) {
  const [pending, setPending] = useState(false)
  const busy = loading || pending

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (disabled || busy) return
    const result = onClick?.(event)
    if (!result || typeof result.then !== 'function') return

    setPending(true)
    void result.then(
      () => setPending(false),
      (error: unknown) => {
        setPending(false)
        if (onError) onError(error)
        else globalThis.reportError(error)
      },
    )
  }

  return (
    <Button
      {...props}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={handleClick}
    >
      {busy ? <Spinner aria-hidden="true" /> : null}
      {children}
    </Button>
  )
}
