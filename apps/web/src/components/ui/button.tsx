import { cva } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 border px-4 py-2',
  {
    variants: {
      variant: {
        default:
          'bg-emerald-950 text-white border-emerald-950 hover:bg-emerald-800',
        outline: 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100',
      },
    },
    defaultVariants: { variant: 'outline' },
  },
)

export function Button({
  className,
  variant,
  ...props
}: ComponentProps<'button'> & { variant?: 'default' | 'outline' }) {
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant }), className)}
      {...props}
    />
  )
}
