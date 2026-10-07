import { memo } from 'react'
import { usePlaybackStore } from '@/shared/state/playback'
import { usePreviewBridgeStore } from '@/shared/state/preview-bridge'
import { useTimelineViewportStore } from '@/features/editor/deps/timeline-store-contract'

function formatClock(frame: number, fps: number): string {
  const seconds = Math.floor(frame / Math.max(1, fps))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Compact monitor seek surface. This is a second control over the canonical
 * playhead, not a second timeline, preview, or transport state.
 */
export const ProgramSeekBar = memo(function ProgramSeekBar({
  totalFrames,
  fps,
  disabled = false,
}: {
  totalFrames: number
  fps: number
  disabled?: boolean
}) {
  const currentFrame = usePlaybackStore((state) => state.currentFrame)
  const maxFrame = Math.max(0, totalFrames - 1)
  const clampedFrame = Math.max(0, Math.min(maxFrame, currentFrame))
  const percent = maxFrame > 0 ? (clampedFrame / maxFrame) * 100 : 0
  const seek = (frame: number) => {
    usePlaybackStore.getState().setPreviewFrame(null)
    usePreviewBridgeStore.getState().setDisplayedFrame(null)
    const targetFrame = Math.max(0, Math.min(maxFrame, Math.round(frame)))
    usePlaybackStore.getState().setCurrentFrame(targetFrame)
    useTimelineViewportStore.getState().requestScrollToFrame(targetFrame)
  }

  return (
    <div
      className="group flex h-[15px] w-full items-center gap-2 px-3"
      data-testid="program-seek-bar"
    >
      <input
        type="range"
        min={0}
        max={maxFrame}
        step={1}
        value={clampedFrame}
        disabled={disabled || maxFrame === 0}
        onChange={(event) => seek(Number(event.currentTarget.value))}
        aria-label="Seek in program"
        aria-valuetext={`${formatClock(clampedFrame, fps)} of ${formatClock(maxFrame, fps)}`}
        className="peer relative z-10 h-[15px] w-full min-w-0 cursor-pointer appearance-none bg-transparent outline-none disabled:cursor-default [&::-moz-range-thumb]:h-[12px] [&::-moz-range-thumb]:w-[12px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[#526955] [&::-moz-range-thumb]:opacity-0 [&::-webkit-slider-thumb]:h-[12px] [&::-webkit-slider-thumb]:w-[12px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-[#526955] [&::-webkit-slider-thumb]:opacity-0 hover:[&::-webkit-slider-thumb]:opacity-100 focus-visible:[&::-webkit-slider-thumb]:opacity-100 hover:[&::-moz-range-thumb]:opacity-100 focus-visible:[&::-moz-range-thumb]:opacity-100"
        style={{
          background: `linear-gradient(to right, var(--muted-foreground) ${percent}%, var(--border) ${percent}%) center / 100% 3px no-repeat`,
        }}
      />
    </div>
  )
})
