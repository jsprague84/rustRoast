import { HTMLAttributes } from 'react'
import { cn } from '../../utils/cn'

export interface LoadingSpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'default' | 'primary' | 'white'
  text?: string
}

export function LoadingSpinner({
  size = 'md',
  variant = 'default',
  text,
  className,
  ...props
}: LoadingSpinnerProps) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
    xl: 'h-12 w-12'
  }

  const variants = {
    default: 'border-gray-300 border-t-gray-600',
    primary: 'border-primary-200 border-t-primary-600',
    white: 'border-white/20 border-t-white'
  }

  return (
    <div className={cn('flex items-center justify-center gap-2', className)} {...props}>
      <div
        className={cn(
          'animate-spin rounded-full border-2',
          sizes[size],
          variants[variant]
        )}
      />
      {text && (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {text}
        </span>
      )}
    </div>
  )
}

export function LoadingOverlay({
  isLoading,
  text = 'Loading...',
  children
}: {
  isLoading: boolean
  text?: string
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      {children}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50">
          <LoadingSpinner size="lg" text={text} />
        </div>
      )}
    </div>
  )
}