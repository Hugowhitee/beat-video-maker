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
  const safeFps = Math.max(1, fps)
  const releaseMs = Math.max(10, Math.round((binding.releaseFrames / safeFps) * 1000))
  const leadInMs = Math.max(0, Math.round((binding.attackFrames / safeFps) * 1000))
  const noLiveCommit = () => {}

  return (
    <div className="mx-2 mb-2 mt-0.5 border-t border-border/70 pt-2">
      <div className="mb-2 flex items-center gap-1.5">
        <AudioLines className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-xs font-medium text-foreground">
          {label}
        </span>
        <Select
          value={binding.driver}
          onValueChange={(driver) =>
            onChange({ driver: driver as AudioReactiveBinding['driver'] })
          }
        >
          <SelectTrigger className="ml-auto h-7 w-[104px] px-2 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="audio">Audio hit</SelectItem>
            <SelectItem value="beat">Beat grid</SelectItem>
            <SelectItem value="downbeat">Downbeat</SelectItem>
            <SelectItem value="low">Low / bass</SelectItem>
            <SelectItem value="mid">Mid</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
        <span className="text-[11px] text-muted-foreground">Amount</span>
        <SliderInput
          value={binding.amount}
          min={resolvedAmountRange.min}
          max={resolvedAmountRange.max}
          step={resolvedAmountRange.step}
          onLiveChange={noLiveCommit}
          onChange={(amount) => onChange({ amount })}
        />

        <span className="text-[11px] text-muted-foreground">Threshold</span>
        <SliderInput
          value={binding.threshold}
          min={0}
          max={1}
          step={0.01}
          formatValue={(value) => `${Math.round(value * 100)}%`}
          onLiveChange={noLiveCommit}
          onChange={(threshold) => onChange({ threshold })}
        />

        <span className="text-[11px] text-muted-foreground">Release</span>
        <SliderInput
          value={releaseMs}
          min={40}
          max={600}
          step={10}
          unit=" ms"
          onLiveChange={noLiveCommit}
          onChange={(milliseconds) =>
            onChange({
              releaseFrames: Math.max(1, Math.round((milliseconds / 1000) * safeFps)),
            })
          }
        />
      </div>

      <details className="mt-2 border-t border-border/70 pt-1.5">
        <summary className="cursor-pointer list-none text-[11px] font-medium text-muted-foreground marker:hidden [&::-webkit-details-marker]:hidden">
          Advanced
        </summary>
        <div className="mt-1.5 grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
          <span className="text-[11px] text-muted-foreground">Sensitivity</span>
          <SliderInput
            value={binding.sensitivity}
            min={0.25}
            max={2}
            step={0.05}
            formatValue={(value) => `${value.toFixed(2)}×`}
            onLiveChange={noLiveCommit}
            onChange={(sensitivity) => onChange({ sensitivity })}
          />

          <span className="text-[11px] text-muted-foreground">Lead-in</span>
          <SliderInput
            value={leadInMs}
            min={0}
            max={250}
            step={10}
            unit=" ms"
            onLiveChange={noLiveCommit}
            onChange={(milliseconds) =>
              onChange({
                attackFrames: Math.max(0, Math.round((milliseconds / 1000) * safeFps)),
              })
            }
          />

          <span className="text-[11px] text-muted-foreground">Every hit</span>
          <SliderInput
            value={binding.everyNthBeat}
            min={1}
            max={16}
            step={1}
            formatValue={(value) => `1 / ${Math.round(value)}`}
            onLiveChange={noLiveCommit}
            onChange={(everyNthBeat) =>
              onChange({ everyNthBeat: Math.max(1, Math.round(everyNthBeat)) })
            }
          />

          <span className="text-[11px] text-muted-foreground">Options</span>
          <div className="flex min-w-0 items-center gap-3 text-[11px] text-muted-foreground">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={binding.useStrength}
                onChange={(event) => onChange({ useStrength: event.target.checked })}
              />
              Strength
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={binding.invert === true}
                onChange={(event) => onChange({ invert: event.target.checked })}
              />
              Invert
            </label>
          </div>
        </div>
      </details>
    </div>
  )
})
