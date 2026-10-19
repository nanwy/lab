import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" className={cn('flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 aria-invalid:border-red-700', className)} {...props} />
}
