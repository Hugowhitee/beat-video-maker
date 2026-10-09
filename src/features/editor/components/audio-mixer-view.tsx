import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react'
import { useTranslation } from 'react-i18next'
import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
import {
  linearLevelToPercent,
  setLiveTrackVolumeOverride,
  clearLiveTrackVolumeOverride,
  setLiveBusVolumeOverride,
  clearLiveBusVolumeOverride,
} from './audio-meter-utils'
import { getMixerLiveGain, setMixerLiveGains } from '@/shared/state/mixer-live-gain'
import { NumberInput } from '@/shared/ui/property-controls/number-input'
import { RotateCcw } from 'lucide-react'
import { ConsoleFaderFace } from '@/shared/ui/property-controls/console-fader'
import {
  FADER_DB_MIN,
  FADER_DB_MAX,
  FADER_KNOB_HEIGHT_PX,
  FADER_KNOB_DRAG_TOLERANCE_PX,
  FADER_SCALE_MARKS,
  dbToFaderPercent,
  faderPercentToDb,
  formatFaderDb,
  faderKeyboardValue,
} from '@/shared/ui/property-controls/console-fader-calibration'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AudioMixerTrack {
  id: string
  name: string
  kind?: 'video' | 'audio'
  color?: string
  muted: boolean
  solo: boolean
  volume: number // dB, -60 to +12
  eqEnabled?: boolean
  itemIds: string[] // item IDs on this track (for live gain during fader drag)
}

interface AudioMixerViewProps {
  tracks: AudioMixerTrack[]
  perTrackLevels: Map<
    string,
    {
      left: number
      right: number
      unresolvedSourceCount: number
      resolvedSourceCount: number
    }
  >
  masterEstimate: {
    left: number
    right: number
    unresolvedSourceCount: number
    resolvedSourceCount: number
  }
  isPlaying: boolean
  masterVolumeDb: number
  masterMuted: boolean
  onMasterVolumeChange: (volumeDb: number) => void
  onMasterMuteToggle: () => void
  onTrackVolumeChange: (trackId: string, volumeDb: number) => void
  onTrackMuteToggle: (trackId: string) => void
  onTrackSoloToggle: (trackId: string) => void
  onTrackEqToggle?: (trackId: string) => void
  onBusEqToggle?: () => void
  activeEqTrackId?: string | null
  busEqActive?: boolean
  busEqEnabled?: boolean
  headerExtra?: ReactNode
  /** Expanded layout for floating panel — wider strips, bigger meters */
  expanded?: boolean
  /** Master workspace uses this as a pre-master track mixer, so the post-rack master strip is hidden. */
  showMasterStrip?: boolean
}

// ---------------------------------------------------------------------------
// dB <-> fader mapping
// ---------------------------------------------------------------------------

function MixerGainReadout({
  volumeDb,
  label,
  readoutRef,
  onChange,
}: {
  volumeDb: number
  label: string
  readoutRef: RefObject<HTMLDivElement | null>
  onChange: (value: number) => void
}) {
  return (
    <div className="flex min-w-0 w-full items-center gap-0.5 self-center" ref={readoutRef}>
      <label className="block min-w-0 flex-1" title="Channel gain in dB">
        <span className="sr-only">{label} gain in dB</span>
        <NumberInput
          value={volumeDb}
          min={FADER_DB_MIN}
          max={FADER_DB_MAX}
          step={0.1}
          scrubEnabled={false}
          unitWidth={0}
          formatInputValue={formatFaderDb}
          className="h-6 min-w-0 w-full rounded-[2px] [&>input]:text-[11px] [&>span]:hidden"
          onChange={(value) => {
            if (value !== volumeDb) onChange(value)
          }}
        />
      </label>
      <button
        type="button"
        className="studio-secondary-action flex h-6 w-5 shrink-0 items-center justify-center rounded-[2px] p-0"
        aria-label={`Reset ${label} gain to unity`}
        title="Unity · 0.0 dB"
        onClick={() => onChange(0)}
      >
        <RotateCcw className="h-3 w-3" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Segmented LED meter (shared between channel strips & bus)
// ---------------------------------------------------------------------------

// Segment dimensions: 3px tall segments with 1px gaps = 4px pitch.
// CSS mask-image creates the segmented look over the existing gradient fill.
// This keeps the same animation system (height %) while adding the hardware feel.
const SEGMENT_MASK =
  'repeating-linear-gradient(to top, black 0px, black 3px, transparent 3px, transparent 4px)'
const UNLIT_LED_BG =
  'repeating-linear-gradient(to top, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 3px, transparent 3px, transparent 4px)'

interface SegmentedMeterBarProps {
  /** CSS height value, e.g. "42%" */
  height: string
  /** CSS bottom value for peak hold, e.g. "58%" */
  peakBottom?: string
  /** Whether the source is still scanning (unresolved waveform) */
  scanning?: boolean
  /** Additional className for the outer container */
  className?: string
  /** Optional attributes for the active fill element */
  fillProps?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | undefined>
  /** Imperative ref used for smooth local meter preview during fader drag */
  fillRef?: RefObject<HTMLDivElement | null>
}

const SegmentedMeterBar = memo(function SegmentedMeterBar({
  height,
  peakBottom,
  scanning,
  className = '',
  fillProps,
  fillRef,
}: SegmentedMeterBarProps) {
  return (
    <div className={`relative flex-1 rounded-[2px] bg-[#08090b] overflow-hidden ${className}`}>
      {/* Unlit LED backdrop */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: UNLIT_LED_BG }} />

      {/* Active fill — gradient with segment mask */}
      <div
        ref={fillRef}
        {...fillProps}
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#1be255] via-[#f5e146] to-[#ff6633] ${scanning ? 'opacity-50' : ''}`}
        style={{
          height,
          maskImage: SEGMENT_MASK,
          WebkitMaskImage: SEGMENT_MASK,
          transition: 'height 100ms ease-out',
        }}
      />

      {/* Peak hold — single bright segment */}
      {peakBottom != null && (
        <div
          className="absolute inset-x-0 h-[3px] rounded-[1px] bg-white/85 shadow-[0_0_4px_rgba(255,255,255,0.5)]"
          style={{
            bottom: peakBottom,
            maskImage: SEGMENT_MASK,
            WebkitMaskImage: SEGMENT_MASK,
            transition: 'bottom 100ms ease-out',
          }}
        />
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Scale marks (shared left column)
// ---------------------------------------------------------------------------

function getMeterFallbackPercent(params: {
  unresolvedSourceCount: number
  resolvedSourceCount: number
  isPlaying: boolean
}): number {
  if (!params.isPlaying) {
    return 0
  }

  if (params.unresolvedSourceCount > 0 && params.resolvedSourceCount === 0) {
    return 18
  }

  return 0
}

// ---------------------------------------------------------------------------
// Channel strip fader (per track)
// ---------------------------------------------------------------------------

interface ChannelFaderProps {
  trackId: string
  trackName: string
  volumeDb: number
  /** Item IDs on this track — used to set per-item live gain during drag */
  itemIds: string[]
  /** Called once on drag end — triggers store update + markDirty */
  onVolumeChange: (trackId: string, volumeDb: number) => void
  /** Imperative ref for updating the dB readout during drag (no re-render) */
  dbReadoutRef?: RefObject<HTMLDivElement | null>
  /** Immediate visual preview for the per-track meter while graph estimates catch up */
  onMeterPreviewChange?: (previewDb: number | null) => void
}

const ChannelFader = memo(function ChannelFader({
  trackId,
  trackName,
  volumeDb,
  itemIds,
  onVolumeChange,
  dbReadoutRef,
  onMeterPreviewChange,
}: ChannelFaderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const knobRef = useRef<HTMLDivElement | null>(null)
  const isDraggingRef = useRef(false)
  const dragOffsetPercentRef = useRef(0)
  const latestDbRef = useRef(volumeDb)
  const dragStartDbRef = useRef(volumeDb)
  const dragStartGainsRef = useRef<Map<string, number>>(new Map())
  const finalizeDragRef = useRef<
    (params?: {
      pointerId?: number
      target?: Pick<HTMLDivElement, 'releasePointerCapture'> | null
    }) => void
  >(() => {})

  // Sync from props when not dragging
  if (!isDraggingRef.current) {
    latestDbRef.current = volumeDb
  }

  const percentFromPointerEvent = useCallback((e: PointerEvent): number => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    if (rect.height <= 0) return 0
    const y = Math.max(0, Math.min(rect.height, rect.bottom - e.clientY))
    return (y / rect.height) * 100
  }, [])

  const dragOffsetPercentFromPointerEvent = useCallback((e: PointerEvent): number => {
    const el = trackRef.current
    if (!el) return 0

    const rect = el.getBoundingClientRect()
    if (rect.height <= 0) return 0

    const pointerYFromBottom = Math.max(0, Math.min(rect.height, rect.bottom - e.clientY))
    const currentPercent = dbToFaderPercent(latestDbRef.current)
    const knobCenterYFromBottom = (currentPercent / 100) * rect.height
    const pointerIsNearKnob =
      Math.abs(pointerYFromBottom - knobCenterYFromBottom) <=
      Math.max(FADER_KNOB_DRAG_TOLERANCE_PX, FADER_KNOB_HEIGHT_PX / 2)

    if (!pointerIsNearKnob) {
      return 0
    }

    return currentPercent - (pointerYFromBottom / rect.height) * 100
  }, [])

  // Pure DOM update + live audio gain — zero store writes, zero React renders of composition
  const applyDragValue = useCallback(
    (db: number) => {
      latestDbRef.current = db
      trackRef.current?.setAttribute('aria-valuenow', String(db))
      trackRef.current?.setAttribute('aria-valuetext', `${formatFaderDb(db)} dB`)
      if (knobRef.current) {
        knobRef.current.style.top = `${100 - dbToFaderPercent(db)}%`
      }
      if (dbReadoutRef?.current) {
        const input = dbReadoutRef.current.querySelector('input')
        if (input) input.value = formatFaderDb(db)
      }
      // Compute gain multiplier relative to the committed track volume.
      const committedDb = dragStartDbRef.current
      const gainRatio = Math.pow(10, (db - committedDb) / 20)
      setMixerLiveGains(
        itemIds.map((id) => ({
          itemId: id,
          gain: (dragStartGainsRef.current.get(id) ?? 1) * gainRatio,
        })),
      )

      // Feed live volume into the meter source builder so both per-track
      // and bus meters update in real-time during drag.
      setLiveTrackVolumeOverride(trackId, db)
      onMeterPreviewChange?.(db)
    },
    [dbReadoutRef, itemIds, onMeterPreviewChange, trackId],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.currentTarget.focus({ preventScroll: true })
      e.currentTarget.setPointerCapture?.(e.pointerId)
      isDraggingRef.current = true
      dragStartDbRef.current = latestDbRef.current
      dragStartGainsRef.current = new Map(itemIds.map((id) => [id, getMixerLiveGain(id)]))
      dragOffsetPercentRef.current = dragOffsetPercentFromPointerEvent(e.nativeEvent)
      const percent = percentFromPointerEvent(e.nativeEvent)
      const adjustedPercent = Math.max(0, Math.min(100, percent + dragOffsetPercentRef.current))
      applyDragValue(Math.round(faderPercentToDb(adjustedPercent) * 10) / 10)
    },
    [applyDragValue, dragOffsetPercentFromPointerEvent, itemIds, percentFromPointerEvent],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return
      const percent = percentFromPointerEvent(e.nativeEvent)
      const adjustedPercent = Math.max(0, Math.min(100, percent + dragOffsetPercentRef.current))
      applyDragValue(Math.round(faderPercentToDb(adjustedPercent) * 10) / 10)
    },
    [applyDragValue, percentFromPointerEvent],
  )

  const finalizeDrag = useCallback(
    (params?: {
      pointerId?: number
      target?: Pick<HTMLDivElement, 'releasePointerCapture'> | null
    }) => {
      if (!isDraggingRef.current) {
        return
      }

      const { pointerId, target } = params ?? {}
      isDraggingRef.current = false
      dragOffsetPercentRef.current = 0
      if (target && pointerId !== undefined) {
        target.releasePointerCapture?.(pointerId)
      }
      // Commit to store first so the graph recompiles with the new value,
      // then clear the live override so the next resolution uses the compiled value.
      onVolumeChange(trackId, latestDbRef.current)
      clearLiveTrackVolumeOverride(trackId)
      onMeterPreviewChange?.(null)
    },
    [onMeterPreviewChange, onVolumeChange, trackId],
  )
  finalizeDragRef.current = finalizeDrag

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      finalizeDrag({
        pointerId: e.pointerId,
        target: e.currentTarget,
      })
    },
    [finalizeDrag],
  )

  useEffect(() => {
    return () => {
      finalizeDragRef.current()
    }
  }, [])

  const handleDoubleClick = useCallback(() => {
    dragStartDbRef.current = latestDbRef.current
    dragStartGainsRef.current = new Map(itemIds.map((id) => [id, getMixerLiveGain(id)]))
    applyDragValue(0)
    onVolumeChange(trackId, 0)
    clearLiveTrackVolumeOverride(trackId)
    onMeterPreviewChange?.(null)
  }, [applyDragValue, itemIds, onMeterPreviewChange, onVolumeChange, trackId])

  return (
    <div
      ref={trackRef}
      data-track-id={trackId}
      data-fader-root="true"
      className="group relative h-full cursor-ns-resize select-none touch-none rounded-[2px] outline-none hover:bg-foreground/[0.025] focus-visible:ring-1 focus-visible:ring-ring"
      role="slider"
      tabIndex={0}
      aria-label={`${trackName} volume`}
      aria-orientation="vertical"
      aria-valuemin={FADER_DB_MIN}
      aria-valuemax={FADER_DB_MAX}
      aria-valuenow={volumeDb}
      aria-valuetext={`${formatFaderDb(volumeDb)} dB`}
      title="Drag to balance · Shift + arrow for 0.1 dB · double-click or Enter for unity"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onKeyDown={(event) => {
        const next = faderKeyboardValue(event, latestDbRef.current)
        if (next === null) return
        event.preventDefault()
        event.stopPropagation()
        dragStartDbRef.current = latestDbRef.current
        dragStartGainsRef.current = new Map(itemIds.map((id) => [id, getMixerLiveGain(id)]))
        applyDragValue(Math.round(next * 10) / 10)
        onVolumeChange(trackId, latestDbRef.current)
        clearLiveTrackVolumeOverride(trackId)
        onMeterPreviewChange?.(null)
      }}
    >
      <ConsoleFaderFace volumeDb={volumeDb} knobRef={knobRef} trackId={trackId} />
    </div>
  )
})

// ---------------------------------------------------------------------------
// Channel strip
// ---------------------------------------------------------------------------

interface ChannelStripProps {
  track: AudioMixerTrack
  level:
    | {
        left: number
        right: number
        unresolvedSourceCount: number
        resolvedSourceCount: number
      }
    | undefined
  isPlaying: boolean
  onVolumeChange: (trackId: string, volumeDb: number) => void
  onMuteToggle: (trackId: string) => void
  onSoloToggle: (trackId: string) => void
  onEqToggle?: (trackId: string) => void
  eqActive?: boolean
}

const ChannelStrip = memo(function ChannelStrip({
  track,
  level,
  isPlaying,
  onVolumeChange,
  onMuteToggle,
  onSoloToggle,
  onEqToggle,
  eqActive = false,
}: ChannelStripProps) {
  const dbReadoutRef = useRef<HTMLDivElement | null>(null)
  const leftBarRef = useRef<HTMLDivElement | null>(null)
  const rightBarRef = useRef<HTMLDivElement | null>(null)
  const leftPercentRef = useRef(0)
  const rightPercentRef = useRef(0)
  const handleMuteClick = useCallback(() => {
    onMuteToggle(track.id)
  }, [onMuteToggle, track.id])

  const handleSoloClick = useCallback(() => {
    onSoloToggle(track.id)
  }, [onSoloToggle, track.id])

  const handleEqClick = useCallback(() => {
    onEqToggle?.(track.id)
  }, [onEqToggle, track.id])

  const fallbackPercent = level
    ? getMeterFallbackPercent({
        unresolvedSourceCount: level.unresolvedSourceCount,
        resolvedSourceCount: level.resolvedSourceCount,
        isPlaying,
      })
    : 0
  const leftPercent = isPlaying
    ? Math.max(level ? linearLevelToPercent(level.left) : 0, fallbackPercent)
    : 0
  const rightPercent = isPlaying
    ? Math.max(level ? linearLevelToPercent(level.right) : 0, fallbackPercent)
    : 0
  const showScanningFallback = fallbackPercent > 0
  leftPercentRef.current = leftPercent
  rightPercentRef.current = rightPercent

  const syncMeterBars = useCallback(() => {
    if (!leftBarRef.current || !rightBarRef.current) return
    leftBarRef.current.style.height = `${leftPercentRef.current}%`
    rightBarRef.current.style.height = `${rightPercentRef.current}%`
  }, [])

  useEffect(() => {
    syncMeterBars()
  }, [syncMeterBars, leftPercent, rightPercent])

  const stripWidth = 'w-[84px] min-w-[84px] max-w-[84px] shrink-0'
  const meterBarWidth = 'w-[14px]'
  const meterBarGap = 'gap-[2px]'
  const buttonSize = 'w-6 h-[22px] text-[10px]'

  return (
    <div className={`flex h-full ${stripWidth}`}>
      {/* Track color stripe — doubles as channel divider */}
      <div
        className="w-[2px] shrink-0"
        style={{ backgroundColor: track.color || 'var(--border)' }}
      />

      {/* Strip body */}
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[24px_26px_26px_minmax(0,1fr)_28px] justify-items-center px-1">
        {/* Track name */}
        <div
          className="w-full truncate self-center px-0.5 text-center text-[11px] font-medium leading-tight text-foreground"
          title={track.name}
        >
          {track.name}
        </div>

        <div className="flex w-full items-center justify-center">
          <button
            type="button"
            className="studio-secondary-action h-[22px] min-w-[30px] rounded-[2px] px-2 text-[10px] font-semibold"
            disabled={!onEqToggle}
            onClick={handleEqClick}
            aria-label={`EQ ${track.name}`}
            aria-pressed={eqActive}
          >
            EQ
          </button>
        </div>

        {/* Solo / Mute buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`${buttonSize} studio-secondary-action flex items-center justify-center rounded-[2px] font-semibold leading-none`}
            onClick={handleSoloClick}
            aria-label={`Solo ${track.name}`}
            aria-pressed={track.solo}
          >
            S
          </button>
          <button
            type="button"
            className={`${buttonSize} studio-secondary-action flex items-center justify-center rounded-[2px] font-semibold leading-none`}
            onClick={handleMuteClick}
            aria-label={`Mute ${track.name}`}
            aria-pressed={track.muted}
          >
            M
          </button>
        </div>

        {/* Fader + segmented level meter area */}
        <div className="flex min-h-0 w-full items-stretch gap-2 py-4">
          <div className="min-w-0 flex-1">
            <ChannelFader
              trackId={track.id}
              trackName={track.name}
              volumeDb={track.volume}
              itemIds={track.itemIds}
              onVolumeChange={onVolumeChange}
              dbReadoutRef={dbReadoutRef}
            />
          </div>
          {/* Segmented per-track level bars */}
          <div className={`flex ${meterBarGap} ${meterBarWidth} shrink-0`}>
            <SegmentedMeterBar
              height="0%"
              scanning={showScanningFallback}
              fillRef={leftBarRef}
              fillProps={{
                'data-track-id': track.id,
                'data-track-channel': 'left',
              }}
            />
            <SegmentedMeterBar
              height="0%"
              scanning={showScanningFallback}
              fillRef={rightBarRef}
              fillProps={{
                'data-track-id': track.id,
                'data-track-channel': 'right',
              }}
            />
          </div>
        </div>

        {/* dB readout — color-coded */}
        <MixerGainReadout
          volumeDb={track.volume}
          label={track.name}
          readoutRef={dbReadoutRef}
          onChange={(value) => onVolumeChange(track.id, value)}
        />
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Bus / master meter
// ---------------------------------------------------------------------------

interface BusMeterProps {
  masterEstimate: AudioMixerViewProps['masterEstimate']
  isPlaying: boolean
  volumeDb: number
  muted: boolean
  allItemIds: string[]
  onVolumeChange: (volumeDb: number) => void
  onMuteToggle: () => void
  onEqToggle?: () => void
  eqActive?: boolean
}

const BusMeter = memo(function BusMeter({
  masterEstimate,
  isPlaying,
  volumeDb,
  muted,
  allItemIds,
  onVolumeChange,
  onMuteToggle,
  onEqToggle,
  eqActive = false,
}: BusMeterProps) {
  const leftBarRef = useRef<HTMLDivElement | null>(null)
  const rightBarRef = useRef<HTMLDivElement | null>(null)
  const dbReadoutRef = useRef<HTMLDivElement | null>(null)

  // Bus fader state
  const trackRef = useRef<HTMLDivElement | null>(null)
  const knobRef = useRef<HTMLDivElement | null>(null)
  const isDraggingRef = useRef(false)
  const dragOffsetPercentRef = useRef(0)
  const latestDbRef = useRef(volumeDb)
  const dragStartDbRef = useRef(volumeDb)
  const dragStartGainsRef = useRef<Map<string, number>>(new Map())

  // Sync from props when not dragging
  if (!isDraggingRef.current) {
    latestDbRef.current = volumeDb
  }

  const percentFromPointerEvent = useCallback((e: PointerEvent): number => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    if (rect.height <= 0) return 0
    const y = Math.max(0, Math.min(rect.height, rect.bottom - e.clientY))
    return (y / rect.height) * 100
  }, [])

  const dragOffsetPercentFromPointerEvent = useCallback((e: PointerEvent): number => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    if (rect.height <= 0) return 0
    const pointerYFromBottom = Math.max(0, Math.min(rect.height, rect.bottom - e.clientY))
    const currentPercent = dbToFaderPercent(latestDbRef.current)
    const knobCenterYFromBottom = (currentPercent / 100) * rect.height
    const pointerIsNearKnob =
      Math.abs(pointerYFromBottom - knobCenterYFromBottom) <=
      Math.max(FADER_KNOB_DRAG_TOLERANCE_PX, FADER_KNOB_HEIGHT_PX / 2)
    if (!pointerIsNearKnob) return 0
    return currentPercent - (pointerYFromBottom / rect.height) * 100
  }, [])

  const applyBusDragValue = useCallback(
    (db: number) => {
      latestDbRef.current = db
      if (knobRef.current) {
        knobRef.current.style.top = `${100 - dbToFaderPercent(db)}%`
      }
      if (dbReadoutRef.current) {
        const input = dbReadoutRef.current.querySelector('input')
        if (input) input.value = formatFaderDb(db)
      }
      trackRef.current?.setAttribute('aria-valuenow', String(db))
      trackRef.current?.setAttribute('aria-valuetext', `${formatFaderDb(db)} dB`)
      // Apply live gain to all items (bus = master gain offset)
      const committedDb = dragStartDbRef.current
      const gainRatio = Math.pow(10, (db - committedDb) / 20)
      setMixerLiveGains(
        allItemIds.map((id) => ({
          itemId: id,
          gain: (dragStartGainsRef.current.get(id) ?? 1) * gainRatio,
        })),
      )
      setLiveBusVolumeOverride(db)
    },
    [allItemIds],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.currentTarget.focus({ preventScroll: true })
      e.currentTarget.setPointerCapture?.(e.pointerId)
      isDraggingRef.current = true
      dragStartDbRef.current = latestDbRef.current
      dragStartGainsRef.current = new Map(allItemIds.map((id) => [id, getMixerLiveGain(id)]))
      dragOffsetPercentRef.current = dragOffsetPercentFromPointerEvent(e.nativeEvent)
      const percent = percentFromPointerEvent(e.nativeEvent)
      const adjustedPercent = Math.max(0, Math.min(100, percent + dragOffsetPercentRef.current))
      applyBusDragValue(Math.round(faderPercentToDb(adjustedPercent) * 10) / 10)
    },
    [allItemIds, applyBusDragValue, dragOffsetPercentFromPointerEvent, percentFromPointerEvent],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return
      const percent = percentFromPointerEvent(e.nativeEvent)
      const adjustedPercent = Math.max(0, Math.min(100, percent + dragOffsetPercentRef.current))
      applyBusDragValue(Math.round(faderPercentToDb(adjustedPercent) * 10) / 10)
    },
    [applyBusDragValue, percentFromPointerEvent],
  )

  const finalizeBusDrag = useCallback(
    (params?: {
      pointerId?: number
      target?: Pick<HTMLDivElement, 'releasePointerCapture'> | null
    }) => {
      if (!isDraggingRef.current) return
      const { pointerId, target } = params ?? {}
      isDraggingRef.current = false
      dragOffsetPercentRef.current = 0
      if (target && pointerId !== undefined) {
        target.releasePointerCapture?.(pointerId)
      }
      onVolumeChange(latestDbRef.current)
      clearLiveBusVolumeOverride()
    },
    [onVolumeChange],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      finalizeBusDrag({ pointerId: e.pointerId, target: e.currentTarget })
    },
    [finalizeBusDrag],
  )

  useEffect(() => {
    return () => {
      finalizeBusDrag()
    }
  }, [finalizeBusDrag])

  const handleDoubleClick = useCallback(() => {
    dragStartDbRef.current = latestDbRef.current
    dragStartGainsRef.current = new Map(allItemIds.map((id) => [id, getMixerLiveGain(id)]))
    applyBusDragValue(0)
    onVolumeChange(0)
    clearLiveBusVolumeOverride()
  }, [allItemIds, applyBusDragValue, onVolumeChange])

  // Smooth the bus meter with CSS transitions rather than rAF
  const fallbackPercent = getMeterFallbackPercent({
    unresolvedSourceCount: masterEstimate.unresolvedSourceCount,
    resolvedSourceCount: masterEstimate.resolvedSourceCount,
    isPlaying,
  })
  const leftPercent = isPlaying
    ? Math.max(linearLevelToPercent(masterEstimate.left), fallbackPercent)
    : 0
  const rightPercent = isPlaying
    ? Math.max(linearLevelToPercent(masterEstimate.right), fallbackPercent)
    : 0
  const showScanningFallback = fallbackPercent > 0

  // Use refs to imperatively update for smoother animation
  useEffect(() => {
    if (leftBarRef.current) leftBarRef.current.style.height = `${leftPercent}%`
    if (rightBarRef.current) rightBarRef.current.style.height = `${rightPercent}%`
  }, [leftPercent, rightPercent])

  return (
    <div className="flex h-full w-[84px] min-w-[84px] shrink-0 flex-col items-center border-l border-border">
      {/* Inset panel */}
      <div className="grid h-full min-w-0 w-full grid-cols-[minmax(0,1fr)] grid-rows-[24px_26px_26px_minmax(0,1fr)_28px] justify-items-center bg-background/25 px-1">
        {/* Label */}
        <div className="self-center whitespace-nowrap text-[11px] font-medium leading-tight text-foreground">
          Master
        </div>
        <div className="flex items-center justify-center">
          <button
            type="button"
            className="studio-secondary-action h-[22px] min-w-[30px] rounded-[2px] px-2 text-[10px] font-semibold"
            disabled={!onEqToggle}
            onClick={onEqToggle}
            aria-label="EQ Master"
            aria-pressed={eqActive}
          >
            EQ
          </button>
        </div>

        {/* Mute button — aligned with S/M row */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            className="studio-secondary-action flex h-[22px] w-6 items-center justify-center rounded-[2px] text-[10px] font-semibold leading-none"
            onClick={onMuteToggle}
            aria-label="Mute master"
            aria-pressed={muted}
          >
            M
          </button>
        </div>

        {/* Meter bars + fader area */}
        <div className="flex min-h-0 w-full items-stretch gap-2 py-4">
          {/* Stereo segmented meter bars */}
          <div className="order-2 flex w-[14px] shrink-0 gap-[2px]">
            <div className="relative flex-1 rounded-[2px] bg-[#08090b] overflow-hidden">
              {/* Unlit LED backdrop */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: UNLIT_LED_BG }}
              />
              {/* Active fill */}
              <div
                ref={leftBarRef}
                data-bus-channel="left"
                className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#1be255] via-[#f5e146] to-[#ff6633] ${showScanningFallback ? 'opacity-50' : ''}`}
                style={{
                  height: '0%',
                  maskImage: SEGMENT_MASK,
                  WebkitMaskImage: SEGMENT_MASK,
                  transition: 'height 100ms ease-out',
                }}
              />
            </div>
            <div className="relative flex-1 rounded-[2px] bg-[#08090b] overflow-hidden">
              {/* Unlit LED backdrop */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: UNLIT_LED_BG }}
              />
              {/* Active fill */}
              <div
                ref={rightBarRef}
                data-bus-channel="right"
                className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#1be255] via-[#f5e146] to-[#ff6633] ${showScanningFallback ? 'opacity-50' : ''}`}
                style={{
                  height: '0%',
                  maskImage: SEGMENT_MASK,
                  WebkitMaskImage: SEGMENT_MASK,
                  transition: 'height 100ms ease-out',
                }}
              />
            </div>
          </div>

          {/* Bus fader — same hit area structure as channel faders */}
          <div className="min-w-0 flex-1">
            <div
              ref={trackRef}
              data-fader-root="true"
              className="relative h-full cursor-ns-resize select-none touch-none rounded-[2px] outline-none hover:bg-foreground/[0.025] focus-visible:ring-1 focus-visible:ring-ring"
              role="slider"
              tabIndex={0}
              aria-label="Master volume"
              aria-orientation="vertical"
              aria-valuemin={FADER_DB_MIN}
              aria-valuemax={FADER_DB_MAX}
              aria-valuenow={volumeDb}
              aria-valuetext={`${formatFaderDb(volumeDb)} dB`}
              title="Drag to balance · Shift + arrow for 0.1 dB · double-click or Enter for unity"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onDoubleClick={handleDoubleClick}
              onKeyDown={(event) => {
                const next = faderKeyboardValue(event, latestDbRef.current)
                if (next === null) return
                event.preventDefault()
                event.stopPropagation()
                dragStartDbRef.current = latestDbRef.current
                dragStartGainsRef.current = new Map(
                  allItemIds.map((id) => [id, getMixerLiveGain(id)]),
                )
                applyBusDragValue(Math.round(next * 10) / 10)
                onVolumeChange(latestDbRef.current)
                clearLiveBusVolumeOverride()
              }}
            >
              <ConsoleFaderFace volumeDb={volumeDb} knobRef={knobRef} role="master" />
            </div>
          </div>
        </div>

        {/* dB readout */}
        <MixerGainReadout
          volumeDb={volumeDb}
          label="Master"
          readoutRef={dbReadoutRef}
          onChange={onVolumeChange}
        />
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Scale column (dB marks on the left side)
// ---------------------------------------------------------------------------

const ScaleColumn = memo(function ScaleColumn({ sticky = false }: { sticky?: boolean }) {
  return (
    <div
      aria-hidden="true"
      title="Fader gain scale · dB"
      className={`grid w-8 min-w-8 shrink-0 grid-rows-[76px_minmax(0,1fr)_28px] ${sticky ? 'sticky left-0 z-10 bg-background pr-1' : ''}`}
    >
      <div className="self-end pb-2 text-right font-mono text-[10px] text-muted-foreground">dB</div>
      <div className="min-h-0 py-4">
        <div className="relative h-full">
          {FADER_SCALE_MARKS.map((mark) => {
            const percent = dbToFaderPercent(mark)
            return (
              <div
                key={mark}
                className={`absolute right-0 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] leading-none tabular-nums ${mark === 0 ? 'text-foreground' : 'text-muted-foreground'}`}
                style={{ top: `${100 - percent}%` }}
              >
                {mark > 0 ? `+${mark}` : mark}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Tracks resize handle — drag to tuck channel strips behind the bus
// ---------------------------------------------------------------------------

const TRACKS_PEEK_WIDTH = 4 // min visible sliver when fully tucked

interface MixerBodyProps {
  tracks: AudioMixerTrack[]
  perTrackLevels: AudioMixerViewProps['perTrackLevels']
  masterEstimate: AudioMixerViewProps['masterEstimate']
  isPlaying: boolean
  expanded?: boolean
  masterVolumeDb: number
  masterMuted: boolean
  allItemIds: string[]
  onMasterVolumeChange: (volumeDb: number) => void
  onMasterMuteToggle: () => void
  onTrackVolumeChange: (trackId: string, volumeDb: number) => void
  onTrackMuteToggle: (trackId: string) => void
  onTrackSoloToggle: (trackId: string) => void
  onTrackEqToggle?: (trackId: string) => void
  onBusEqToggle?: () => void
  busEqEnabled?: boolean
  showMasterStrip?: boolean
}

type MixerChannelStripsProps = Pick<
  MixerBodyProps,
  | 'tracks'
  | 'perTrackLevels'
  | 'isPlaying'
  | 'onTrackVolumeChange'
  | 'onTrackMuteToggle'
  | 'onTrackSoloToggle'
  | 'onTrackEqToggle'
>

function MixerChannelStrips({
  tracks,
  perTrackLevels,
  isPlaying,
  onTrackVolumeChange,
  onTrackMuteToggle,
  onTrackSoloToggle,
  onTrackEqToggle,
}: MixerChannelStripsProps) {
  return (
    <>
      {tracks.map((track) => (
        <ChannelStrip
          key={track.id}
          track={track}
          level={perTrackLevels.get(track.id)}
          isPlaying={isPlaying}
          onVolumeChange={onTrackVolumeChange}
          onMuteToggle={onTrackMuteToggle}
          onSoloToggle={onTrackSoloToggle}
          onEqToggle={onTrackEqToggle}
          eqActive={!!track.eqEnabled}
        />
      ))}

      {/* Trailing border after last strip */}
      {tracks.length > 0 && <div className="w-[2px] shrink-0 bg-border/40" />}

      {tracks.length === 0 && (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          No audio tracks
        </div>
      )}
    </>
  )
}

const MixerBody = memo(function MixerBody({
  tracks,
  perTrackLevels,
  masterEstimate,
  isPlaying,
  expanded,
  masterVolumeDb,
  masterMuted,
  allItemIds,
  onMasterVolumeChange,
  onMasterMuteToggle,
  onTrackVolumeChange,
  onTrackMuteToggle,
  onTrackSoloToggle,
  onTrackEqToggle,
  onBusEqToggle,
  busEqEnabled,
  showMasterStrip = true,
}: MixerBodyProps) {
  const stripPx = 84
  // Channel strips + trailing border (scale column is outside the tuckable area)
  const MIN_EMPTY_WIDTH = 80
  const naturalWidth = tracks.length > 0 ? tracks.length * stripPx + 2 : MIN_EMPTY_WIDTH
  const [tracksWidth, setTracksWidth] = useState<number | null>(null) // null = natural
  const [animating, setAnimating] = useState(false)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const didDragRef = useRef(false)
  const tracksWidthRef = useRef<number | null>(tracksWidth)
  tracksWidthRef.current = tracksWidth

  // Reset to natural width when track count changes
  useEffect(() => {
    setTracksWidth(null)
  }, [tracks.length])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      setAnimating(false) // kill transition during drag
      const current = tracksWidthRef.current ?? naturalWidth
      dragRef.current = { startX: e.clientX, startWidth: current }
      didDragRef.current = false
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [naturalWidth],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const dx = e.clientX - drag.startX
      if (Math.abs(dx) > 2) didDragRef.current = true
      // Left-edge resize: drag left = wider, drag right = narrower
      const next = Math.max(TRACKS_PEEK_WIDTH, Math.min(naturalWidth, drag.startWidth - dx))
      setTracksWidth(next)
    },
    [naturalWidth],
  )

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const effectiveWidth = tracksWidth ?? naturalWidth
  const isTucked = effectiveWidth < naturalWidth

  const handleClick = useCallback(() => {
    if (didDragRef.current) return // don't toggle after a drag
    setAnimating(true)
    setTracksWidth(isTucked ? null : TRACKS_PEEK_WIDTH)
  }, [isTucked])

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 gap-1 ${expanded ? 'px-2 py-2' : 'px-0.5 py-1'}`}>
      {/* Drag handle — left edge of the mixer, click to toggle */}
      {!expanded && tracks.length > 0 && (
        <button
          type="button"
          aria-label="Tuck mixer"
          aria-pressed={isTucked}
          className="w-[5px] shrink-0 flex items-center justify-center cursor-col-resize select-none group border-0 bg-transparent p-0"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClick={handleClick}
        >
          <div
            className={`w-[2px] h-8 rounded-full transition-colors ${
              isTucked
                ? 'bg-primary/70 group-hover:bg-primary'
                : 'bg-primary/30 group-hover:bg-primary/60'
            }`}
          />
        </button>
      )}

      {/* dB scale — always visible */}
      {!expanded && <ScaleColumn />}

      {/* Channel strips — tuckable from the right (rightmost tracks hide first) */}
      <div
        className={`min-h-0 ${expanded ? 'min-w-0 flex-1 overflow-x-auto overflow-y-hidden' : 'shrink-0 overflow-hidden'} ${animating ? 'transition-[width] duration-200 ease-out' : ''}`}
        style={{ width: expanded ? undefined : effectiveWidth }}
        data-mixer-channels="true"
        aria-label="Track channels"
        tabIndex={expanded ? 0 : undefined}
        onTransitionEnd={() => setAnimating(false)}
      >
        <div className="flex h-full min-w-max">
          {expanded && <ScaleColumn sticky />}
          <MixerChannelStrips
            tracks={tracks}
            perTrackLevels={perTrackLevels}
            isPlaying={isPlaying}
            onTrackVolumeChange={onTrackVolumeChange}
            onTrackMuteToggle={onTrackMuteToggle}
            onTrackSoloToggle={onTrackSoloToggle}
            onTrackEqToggle={onTrackEqToggle}
          />
          {expanded && showMasterStrip ? (
            <BusMeter
              masterEstimate={masterEstimate}
              isPlaying={isPlaying}
              volumeDb={masterVolumeDb}
              muted={masterMuted}
              allItemIds={allItemIds}
              onVolumeChange={onMasterVolumeChange}
              onMuteToggle={onMasterMuteToggle}
              onEqToggle={onBusEqToggle}
              eqActive={!!busEqEnabled}
            />
          ) : null}
        </div>
      </div>

      {/* The Beatvideo Master workspace uses this as a pre-master track mixer.
          Generic/advanced mixer surfaces can still expose the post-rack Master strip. */}
      {!expanded && showMasterStrip ? (
        <BusMeter
          masterEstimate={masterEstimate}
          isPlaying={isPlaying}
          volumeDb={masterVolumeDb}
          muted={masterMuted}
          allItemIds={allItemIds}
          onVolumeChange={onMasterVolumeChange}
          onMuteToggle={onMasterMuteToggle}
          onEqToggle={onBusEqToggle}
          eqActive={!!busEqEnabled}
        />
      ) : null}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Main mixer view
// ---------------------------------------------------------------------------

export const AudioMixerView = memo(function AudioMixerView({
  tracks,
  perTrackLevels,
  masterEstimate,
  isPlaying,
  masterVolumeDb,
  masterMuted,
  onMasterVolumeChange,
  onMasterMuteToggle,
  onTrackVolumeChange,
  onTrackMuteToggle,
  onTrackSoloToggle,
  onTrackEqToggle,
  onBusEqToggle,
  busEqEnabled,
  headerExtra,
  expanded,
  showMasterStrip = true,
}: AudioMixerViewProps) {
  const { t } = useTranslation()
  const outerClassName = expanded
    ? 'panel-bg flex h-full w-full min-w-0 flex-col overflow-hidden'
    : 'panel-bg border-l border-border flex h-full flex-col overflow-hidden w-fit'

  const allItemIds = useMemo(() => tracks.flatMap((track) => track.itemIds), [tracks])

  return (
    <aside className={outerClassName} aria-label={t('editor.audioMeters.audioMixer')}>
      {/* Header — only shown when docked (floating panel has its own title bar) */}
      {!expanded && (
        <div
          className="flex min-w-0 items-center justify-between gap-2 border-b border-border bg-secondary/20 px-2"
          style={{ height: EDITOR_LAYOUT_CSS_VALUES.timelineTracksHeaderHeight }}
        >
          <span className="min-w-0 text-xs text-muted-foreground font-mono uppercase tracking-[0.18em]">
            {t('editor.audioMeters.mixer')}
          </span>
          {headerExtra ?? (
            <span
              className={`h-2 w-2 rounded-full ${isPlaying ? 'bg-primary shadow-[0_0_8px_rgba(176,219,71,0.65)]' : 'bg-muted-foreground/30'}`}
              aria-hidden="true"
            />
          )}
        </div>
      )}

      {/* Mixer body */}
      <MixerBody
        tracks={tracks}
        perTrackLevels={perTrackLevels}
        masterEstimate={masterEstimate}
        isPlaying={isPlaying}
        expanded={expanded}
        masterVolumeDb={masterVolumeDb}
        masterMuted={masterMuted}
        allItemIds={allItemIds}
        onMasterVolumeChange={onMasterVolumeChange}
        onMasterMuteToggle={onMasterMuteToggle}
        onTrackVolumeChange={onTrackVolumeChange}
        onTrackMuteToggle={onTrackMuteToggle}
        onTrackSoloToggle={onTrackSoloToggle}
        onTrackEqToggle={onTrackEqToggle}
        onBusEqToggle={onBusEqToggle}
        busEqEnabled={busEqEnabled}
        showMasterStrip={showMasterStrip}
      />
    </aside>
  )
})
