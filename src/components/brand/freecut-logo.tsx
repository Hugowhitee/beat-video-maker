import { cn } from '@/shared/ui/cn'

interface FreeCutLogoProps {
  variant?: 'full' | 'icon'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeConfig = {
  sm: { icon: 'w-5 h-5 text-[10px]', text: 'text-sm', gap: 'gap-1.5' },
  md: { icon: 'w-7 h-7 text-xs', text: 'text-lg', gap: 'gap-2' },
  lg: { icon: 'w-9 h-9 text-sm', text: 'text-2xl', gap: 'gap-2.5' },
}

function BeatvideoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid place-items-center rounded-[5px] border border-border bg-foreground font-semibold text-background',
        className,
      )}
      aria-hidden="true"
    >
      B
    </span>
  )
}

/**
 * Kept under the donor export name while the migration is isolated so upstream
 * call sites stay small. The visible product identity is Beatvideo Maker.
 */
export function FreeCutLogo({ variant = 'full', size = 'md', className }: FreeCutLogoProps) {
  const config = sizeConfig[size]

  if (variant === 'icon') {
    return <BeatvideoMark className={cn(config.icon, className)} />
  }

  return (
    <div className={cn('flex items-center', config.gap, className)}>
      <BeatvideoMark className={config.icon} />
      <span className={cn(config.text, 'font-semibold tracking-tight text-foreground')}>
        Beatvideo Maker
      </span>
    </div>
  )
}
