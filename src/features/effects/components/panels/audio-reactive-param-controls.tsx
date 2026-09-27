import { memo } from 'react'
import { AudioLines } from 'lucide-react'
import type { EffectParam } from '@/infrastructure/gpu-effects/types'
import type { AudioReactiveBinding } from '@/types/beatvideo'
import { SliderInput } from '@/shared/ui/property-controls'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getAudioReactiveAmountRange } from '@/features/effects/utils/audio-reactive-bindings'

export type AudioReactiveAmountRange = {
  min: number
  max: number
  step: number
}

interface AudioReactiveParamControlsProps {
  binding: AudioReactiveBinding
  param?: EffectParam
  amountRange?: AudioReactiveAmountRange
  label?: string
  fps: number
  onChange: (patch: Partial<AudioReactiveBinding>) => void
}

export const AudioReactiveParamControls = memo(function AudioReactiveParamControls({
  binding,
  param,
  amountRange,
  label = 'Reactive',
  fps,
  onChange,
}: AudioReactiveParamControlsProps) {
  const resolvedAmountRange =
    amountRange ??
    (param
      ? getAudioReactiveAmountRange(param)
      : { min: -1, max: 1, step: 0.01 })
  const releaseMs = Math.max(10, Math.round((binding.releaseFrames / Math.max(1, fps)) * 1000))
  const noLiveCommit = () => {}

  return (
    <div className="mx-2 mb-2 mt-0.5 rounded-md border border-border/80 bg-secondary/25 px-2 py-2">
      <div className="mb-2 flex items-center gap-1.5">
        <AudioLines className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground">
          {label}
        </span>
        <Select
          value={binding.driver}
          onValueChange={(driver) =>
            onChange({ driver: driver as AudioReactiveBinding['driver'] })
          }
        >
          <SelectTrigger className="ml-auto h-6 w-[92px] px-2 text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="beat">Beat</SelectItem>
            <SelectItem value="downbeat">Downbeat</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
        <span className="text-[10px] text-muted-foreground">Amount</span>
        <SliderInput
          value={binding.amount}
          min={resolvedAmountRange.min}
          max={resolvedAmountRange.max}
          step={resolvedAmountRange.step}
          onLiveChange={noLiveCommit}
          onChange={(amount) => onChange({ amount })}
        />
      </div>

      <details className="mt-2 border-t border-border/70 pt-1.5">
        <summary className="cursor-pointer list-none text-[9px] font-medium text-muted-foreground marker:hidden [&::-webkit-details-marker]:hidden">
          Fine tune
        </summary>
        <div className="mt-1.5 grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
          <span className="text-[10px] text-muted-foreground">Threshold</span>
          <SliderInput
            value={binding.threshold}
            min={0}
            max={1}
            step={0.01}
            formatValue={(value) => `${Math.round(value * 100)}%`}
            onLiveChange={noLiveCommit}
            onChange={(threshold) => onChange({ threshold })}
          />

          <span className="text-[10px] text-muted-foreground">Release</span>
          <SliderInput
            value={releaseMs}
            min={40}
            max={600}
            step={10}
            unit=" ms"
            onLiveChange={noLiveCommit}
            onChange={(milliseconds) =>
              onChange({
                releaseFrames: Math.max(
                  1,
                  Math.round((milliseconds / 1000) * Math.max(1, fps)),
                ),
              })
            }
          />
        </div>
      </details>
    </div>
  )
})
