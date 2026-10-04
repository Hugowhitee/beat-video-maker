/**
 * Preview-only monitor gain.
 *
 * The main speaker button is a direct temporary mute, matching studio transport
 * behavior. The adjacent disclosure button opens the level control. Neither
 * action changes project/export gain.
 */

import { useMemo, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronUp, Volume1, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { usePlaybackStore } from '@/shared/state/playback'

interface MonitorVolumeControlProps {
  /** Style forwarded to the mute button so it matches sibling transport controls. */
  buttonStyle?: CSSProperties
}

export function MonitorVolumeControl({ buttonStyle }: MonitorVolumeControlProps) {
  const { t } = useTranslation()
  const volume = usePlaybackStore((s) => s.volume)
  const muted = usePlaybackStore((s) => s.muted)
  const setVolume = usePlaybackStore((s) => s.setVolume)
  const toggleMute = usePlaybackStore((s) => s.toggleMute)

  const Icon = useMemo(() => {
    if (muted || volume <= 0) return VolumeX
    if (volume < 0.5) return Volume1
    return Volume2
  }, [muted, volume])

  const percent = Math.round(volume * 100)

  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="icon"
        className="flex-shrink-0"
        style={buttonStyle}
        onClick={toggleMute}
        data-tooltip={muted ? t('preview.monitor.unmute') : t('preview.monitor.mute')}
        aria-label={muted ? t('preview.monitor.unmute') : t('preview.monitor.mute')}
        aria-pressed={muted}
      >
        <Icon className="h-3.5 w-3.5" />
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="-ml-0.5 flex h-8 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={t('preview.monitor.volume')}
            data-tooltip={muted ? t('preview.monitor.muted') : `${percent}%`}
          >
            <ChevronUp className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-2.5" align="center" side="top" sideOffset={6}>
          <div className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Slider
              value={[muted ? 0 : volume]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={([value]) => {
                if (value === undefined) return
                if (muted && value > 0) toggleMute()
                setVolume(value)
              }}
              className="flex-1"
              aria-label={t('preview.monitor.volume')}
            />
            <span className="w-9 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
              {muted ? 'MUTE' : `${percent}%`}
            </span>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
