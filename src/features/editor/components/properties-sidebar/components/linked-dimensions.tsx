import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Link2, Link2Off } from 'lucide-react'
import { NumberInput } from './number-input'
import { cn } from '@/shared/ui/cn'
import { useTranslation } from 'react-i18next'

type MixedValue = number | 'mixed'

interface LinkedDimensionsProps {
  width: MixedValue
  height: MixedValue
  aspectLocked: boolean
  onWidthChange: (value: number) => void
  onHeightChange: (value: number) => void
  /** Called during scrub for live preview */
  onWidthLiveChange?: (value: number) => void
  /** Called during scrub for live preview */
  onHeightLiveChange?: (value: number) => void
  onAspectLockToggle: () => void
  disabled?: boolean
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  step?: number
  className?: string
}

/**
 * Width/Height inputs with an aspect-ratio lock toggle.
 * The parent owns the ratio and proportional updates; this component only
 * presents the two fields consistently and exposes the lock interaction.
 */
export function LinkedDimensions({
  width,
  height,
  aspectLocked,
  onWidthChange,
  onHeightChange,
  onWidthLiveChange,
  onHeightLiveChange,
  onAspectLockToggle,
  disabled = false,
  minWidth = 1,
  minHeight = 1,
  maxWidth = 7680,
  maxHeight = 7680,
  step = 1,
  className,
}: LinkedDimensionsProps) {
  const { t } = useTranslation()
  // Commit handlers call both onChange callbacks
  const handleWidthChange = useCallback(
    (newWidth: number) => {
      onWidthChange(newWidth)
    },
    [onWidthChange],
  )

  const handleHeightChange = useCallback(
    (newHeight: number) => {
      onHeightChange(newHeight)
    },
    [onHeightChange],
  )

  // Live handlers for preview during scrub
  const handleWidthLiveChange = useCallback(
    (newWidth: number) => {
      onWidthLiveChange?.(newWidth)
    },
    [onWidthLiveChange],
  )

  const handleHeightLiveChange = useCallback(
    (newHeight: number) => {
      onHeightLiveChange?.(newHeight)
    },
    [onHeightLiveChange],
  )

  return (
    <div
      className={cn('grid grid-cols-[1fr_auto_1fr] gap-1 flex-1 min-w-0 items-center', className)}
    >
      <NumberInput
        value={width}
        onChange={handleWidthChange}
        onLiveChange={handleWidthLiveChange}
        label="W"
        unit="px"
        min={minWidth}
        max={maxWidth}
        step={step}
        disabled={disabled}
      />

      <Button
        variant="ghost"
        size="icon"
        className={cn('h-7 w-7', aspectLocked && 'text-primary')}
        onClick={onAspectLockToggle}
        disabled={disabled}
        title={
          aspectLocked
            ? t('editor.layoutSection.unlockAspect')
            : t('editor.layoutSection.lockAspect')
        }
        aria-label={
          aspectLocked
            ? t('editor.layoutSection.unlockAspect')
            : t('editor.layoutSection.lockAspect')
        }
      >
        {aspectLocked ? <Link2 className="w-3.5 h-3.5" /> : <Link2Off className="w-3.5 h-3.5" />}
      </Button>

      <NumberInput
        value={height}
        onChange={handleHeightChange}
        onLiveChange={handleHeightLiveChange}
        label="H"
        unit="px"
        min={minHeight}
        max={maxHeight}
        step={step}
        disabled={disabled}
      />
    </div>
  )
}
