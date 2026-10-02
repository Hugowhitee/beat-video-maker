import { useEffect, useCallback, memo, useLayoutEffect, useReducer, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Slider } from '@/components/ui/slider'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Magnet,
  Scissors,
  Gauge,
  ArrowRightLeft,
  BetweenHorizontalEnd,
  ChevronDown,
  X,
  MousePointer2,
  Undo2,
  Redo2,
  Flag,
  FlagOff,
  Link2,
  Volume2,
  Diamond,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { formatHotkeyBinding } from '@/config/hotkeys'
import { useTimelineStore } from '../stores/timeline-store'
import { useTimelineSettingsStore } from '../stores/timeline-settings-store'
import {
  BEAT_GRID_RESOLUTION_OPTIONS,
  type BeatGridResolution,
} from '../utils/beatvideo-grid-resolution'
import { useTimelineCommandStore } from '../stores/timeline-command-store'
import { useZoomStore } from '../stores/zoom-store'
import { usePlaybackStore } from '@/shared/state/playback'
import { useEditorStore } from '@/shared/state/editor'
import { useSelectionStore } from '@/shared/state/selection'
import { ZOOM_MIN, ZOOM_MAX, SLIP_SLIDE_TOOLS_ENABLED } from '../constants'
import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
import { useResolvedHotkeys } from '@/features/timeline/deps/settings'
import { MicRecordControl } from './mic-record-control'
import type { BeatvideoProjectMode } from '@/types/project'

interface TimelineHeaderProps {
  beatvideoMode?: BeatvideoProjectMode
  simplifiedBeatvideo?: boolean
  compact?: boolean
  onZoomChange?: (newZoom: number) => void
  onZoomIn?: () => void
  onZoomOut?: () => void
  onZoomToFit?: () => void
}

function TrimEditIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="10.6" y="4" width="2.8" height="16" rx="0.75" fill="currentColor" opacity="0.72" />
      <path d="m9 7-6 5 6 5z" fill="currentColor" stroke="none" />
      <path d="m15 7 6 5-6 5z" fill="currentColor" stroke="none" />
    </svg>
  )
}

const InlineKeyframesToggle = memo(function InlineKeyframesToggle({
  isOpen,
  onToggle,
}: {
  isOpen: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const label = t(
    isOpen ? 'timeline.keyframeEditor.editLane.hide' : 'timeline.keyframeEditor.editLane.show',
    { defaultValue: isOpen ? 'Hide keyframe panel' : 'Show keyframe panel' },
  )

  return (
    <Button
      variant="ghost"
      size="icon"
      style={{
        width: EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize,
        height: EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize,
      }}
      onClick={onToggle}
      aria-label={label}
      aria-pressed={isOpen}
      data-tooltip={label}
    >
      <Diamond className="h-3.5 w-3.5" />
    </Button>
  )
})

function isDifferentSliderValue(previousValue: number | null, nextValue: number): boolean {
  return previousValue === null || Math.abs(previousValue - nextValue) > 0.000001
}

function isSameZoomLevel(left: number, right: number): boolean {
  const tolerance = Math.max(0.000001, Math.max(Math.abs(left), Math.abs(right)) * 0.0001)
  return Math.abs(left - right) <= tolerance
}

function blurSliderFocus(root: HTMLElement | null): void {
  const activeElement = document.activeElement
  if (activeElement instanceof HTMLElement && root?.contains(activeElement)) {
    activeElement.blur()
  }
}

const TimelineZoomControls = memo(function TimelineZoomControls({
  compact = false,
  onZoomChange,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
}: TimelineHeaderProps) {
  const { t } = useTranslation()
  const settledZoomLevel = useZoomStore((state) => state.contentLevel)
  const zoomIn = useZoomStore((state) => state.zoomIn)
  const zoomOut = useZoomStore((state) => state.zoomOut)
  const beginZoomGesture = useZoomStore((state) => state.beginZoomGesture)
  const endZoomGesture = useZoomStore((state) => state.endZoomGesture)
  const setZoomImmediate = useZoomStore((state) => state.setZoomLevelImmediate)
  const setZoomSynchronized = useZoomStore((state) => state.setZoomLevelSynchronized)
  const sliderRef = useRef<HTMLSpanElement>(null)
  const sliderRafRef = useRef<number | null>(null)
  const pendingSliderValueRef = useRef<number | null>(null)
  const latestSliderValueRef = useRef<number | null>(null)
  const sliderInteractionRef = useRef<'idle' | 'dragging' | 'awaiting-zoom'>('idle')
  const sliderCommitBaseZoomRef = useRef<number | null>(null)
  const sliderKeyboardInputRef = useRef(false)
  const sliderZoomGestureHeldRef = useRef(false)
  const liveZoomLevelRef = useRef(useZoomStore.getState().level)
  const [, forceKeyboardSliderRender] = useReducer((revision: number) => revision + 1, 0)
  const btnSize = {
    width: compact ? '36px' : EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize,
    height: compact ? '36px' : EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize,
  } as const

  const applyZoom = useCallback(
    (newZoom: number, synchronizeContent = false) => {
      const clampedZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom))
      if (onZoomChange) {
        onZoomChange(clampedZoom)
      } else if (synchronizeContent) {
        setZoomSynchronized(clampedZoom)
      } else {
        setZoomImmediate(clampedZoom)
      }
    },
    [onZoomChange, setZoomImmediate, setZoomSynchronized],
  )

  const sliderToZoom = useCallback(
    (sliderValue: number) => ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, sliderValue),
    [],
  )

  const zoomToSlider = useCallback(
    (zoom: number) => Math.log(zoom / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN),
    [],
  )

  const renderSliderPreview = useCallback((sliderValue: number) => {
    const root = sliderRef.current
    const thumb = root?.querySelector<HTMLElement>('[role="slider"]')
    const thumbPositioner = thumb?.parentElement
    const track = root?.firstElementChild as HTMLElement | null
    const range = track?.firstElementChild as HTMLElement | null
    if (!thumb || !thumbPositioner || !range) return

    const value = Math.max(0, Math.min(1, sliderValue))
    const percentage = value * 100
    const thumbOffset = 8 - value * 16
    thumbPositioner.style.left = `calc(${percentage}% + ${thumbOffset}px)`
    range.style.left = '0%'
    range.style.right = `${100 - percentage}%`
    thumb.setAttribute('aria-valuenow', String(value))
  }, [])

  const releaseSliderZoomGesture = useCallback(() => {
    if (!sliderZoomGestureHeldRef.current) {
      return
    }
    sliderZoomGestureHeldRef.current = false
    endZoomGesture()
  }, [endZoomGesture])

  const finishSliderZoomInteraction = useCallback(() => {
    releaseSliderZoomGesture()
    // Radix can restore thumb focus after onValueCommit returns. Defer the
    // blur until the pointer/key event has fully finished so Space immediately
    // returns to the editor transport.
    queueMicrotask(() => blurSliderFocus(sliderRef.current))
  }, [releaseSliderZoomGesture])

  const beginSliderZoomGesture = useCallback(() => {
    if (sliderZoomGestureHeldRef.current) {
      return
    }
    sliderZoomGestureHeldRef.current = true
    beginZoomGesture()
  }, [beginZoomGesture])

  const flushSliderChange = useCallback(() => {
    sliderRafRef.current = null
    const sliderValue = pendingSliderValueRef.current
    pendingSliderValueRef.current = null
    if (sliderValue === null) return
    applyZoom(sliderToZoom(sliderValue))
  }, [applyZoom, sliderToZoom])

  useLayoutEffect(() => {
    const liveZoomLevel = useZoomStore.getState().level
    liveZoomLevelRef.current = liveZoomLevel
    const sliderPreviewValue = latestSliderValueRef.current
    if (sliderPreviewValue !== null && sliderInteractionRef.current !== 'dragging') {
      const commitBaseZoom = sliderCommitBaseZoomRef.current
      if (commitBaseZoom === null || !isSameZoomLevel(liveZoomLevel, commitBaseZoom)) {
        // The first store update after release owns the controlled value even when
        // another zoom gesture superseded the slider's queued target.
        latestSliderValueRef.current = null
        sliderCommitBaseZoomRef.current = null
        sliderInteractionRef.current = 'idle'
      }
    }

    if (sliderInteractionRef.current !== 'dragging') {
      const previewValue = latestSliderValueRef.current
      renderSliderPreview(previewValue ?? zoomToSlider(liveZoomLevel))
    }
  }, [renderSliderPreview, settledZoomLevel, zoomToSlider])

  useEffect(() => {
    return useZoomStore.subscribe((state) => {
      const nextZoomLevel = state.level
      if (isSameZoomLevel(nextZoomLevel, liveZoomLevelRef.current)) return
      liveZoomLevelRef.current = nextZoomLevel
      if (sliderInteractionRef.current === 'dragging') return

      const commitBaseZoom = sliderCommitBaseZoomRef.current
      if (
        sliderInteractionRef.current === 'awaiting-zoom' &&
        commitBaseZoom !== null &&
        !isSameZoomLevel(nextZoomLevel, commitBaseZoom)
      ) {
        latestSliderValueRef.current = null
        sliderCommitBaseZoomRef.current = null
        sliderInteractionRef.current = 'idle'
      }

      renderSliderPreview(zoomToSlider(nextZoomLevel))
    })
  }, [renderSliderPreview, zoomToSlider])

  useEffect(() => {
    window.addEventListener('pointerup', finishSliderZoomInteraction)
    window.addEventListener('pointercancel', finishSliderZoomInteraction)

    return () => {
      window.removeEventListener('pointerup', finishSliderZoomInteraction)
      window.removeEventListener('pointercancel', finishSliderZoomInteraction)
      if (sliderRafRef.current !== null) {
        cancelAnimationFrame(sliderRafRef.current)
      }
      releaseSliderZoomGesture()
    }
  }, [finishSliderZoomInteraction, releaseSliderZoomGesture])

  const handleSliderChange = useCallback(
    (values: number[]) => {
      const sliderValue = values[0] ?? 0.5
      sliderInteractionRef.current = 'dragging'
      sliderCommitBaseZoomRef.current = null
      latestSliderValueRef.current = sliderValue
      renderSliderPreview(sliderValue)
      if (sliderKeyboardInputRef.current) {
        // Radix derives the next arrow-key step from its controlled value. Keep
        // that value current for keyboard input even though wheel zoom remains
        // on the imperative DOM path until content zoom settles.
        forceKeyboardSliderRender()
        if (onZoomChange) {
          applyZoom(sliderToZoom(sliderValue))
          return
        }
        if (sliderRafRef.current !== null) {
          cancelAnimationFrame(sliderRafRef.current)
          sliderRafRef.current = null
        }
        pendingSliderValueRef.current = null
        applyZoom(sliderToZoom(sliderValue), true)
        return
      }
      if (onZoomChange) {
        applyZoom(sliderToZoom(sliderValue))
        return
      }

      pendingSliderValueRef.current = sliderValue
      if (sliderRafRef.current === null) {
        sliderRafRef.current = requestAnimationFrame(flushSliderChange)
      }
    },
    [
      applyZoom,
      flushSliderChange,
      forceKeyboardSliderRender,
      onZoomChange,
      renderSliderPreview,
      sliderToZoom,
    ],
  )

  const commitSliderZoom = useCallback(
    (sliderValue: number, previousSliderValue: number | null) => {
      if (onZoomChange) {
        if (isDifferentSliderValue(previousSliderValue, sliderValue)) {
          applyZoom(sliderToZoom(sliderValue))
        }
        return
      }

      if (
        pendingSliderValueRef.current === null &&
        isDifferentSliderValue(previousSliderValue, sliderValue)
      ) {
        pendingSliderValueRef.current = sliderValue
      }
      if (sliderRafRef.current !== null) {
        cancelAnimationFrame(sliderRafRef.current)
        sliderRafRef.current = null
      }
      flushSliderChange()
    },
    [applyZoom, flushSliderChange, onZoomChange, sliderToZoom],
  )

  const handleSliderCommit = useCallback(
    (values: number[]) => {
      const sliderValue = values[0] ?? 0.5
      const latestSliderValue = latestSliderValueRef.current
      sliderInteractionRef.current = 'awaiting-zoom'
      sliderCommitBaseZoomRef.current = useZoomStore.getState().level
      latestSliderValueRef.current = sliderValue
      renderSliderPreview(sliderValue)
      commitSliderZoom(sliderValue, latestSliderValue)
      if (sliderKeyboardInputRef.current) {
        releaseSliderZoomGesture()
      } else {
        finishSliderZoomInteraction()
      }
    },
    [
      commitSliderZoom,
      finishSliderZoomInteraction,
      releaseSliderZoomGesture,
      renderSliderPreview,
    ],
  )

  const controlledSliderValue = zoomToSlider(settledZoomLevel)
  const sliderCommitBaseZoom = sliderCommitBaseZoomRef.current
  const shouldRenderSliderPreview =
    latestSliderValueRef.current !== null &&
    (sliderInteractionRef.current === 'dragging' ||
      (sliderInteractionRef.current === 'awaiting-zoom' &&
        sliderCommitBaseZoom !== null &&
        isSameZoomLevel(liveZoomLevelRef.current, sliderCommitBaseZoom)))

  return (
    <div className="flex shrink-0 items-center justify-end gap-1.5">
      <Button
        variant="ghost"
        size="icon"
        style={btnSize}
        onClick={onZoomOut ?? zoomOut}
        aria-label={t('timeline.header.zoomOut')}
        data-tooltip={t('timeline.header.zoomOutTooltip')}
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </Button>

      {!compact ? (
      <Slider
        ref={sliderRef}
        value={[
          shouldRenderSliderPreview
            ? (latestSliderValueRef.current ?? controlledSliderValue)
            : controlledSliderValue,
        ]}
        onValueChange={handleSliderChange}
        onValueCommit={handleSliderCommit}
        onPointerDownCapture={beginSliderZoomGesture}
        onPointerCancelCapture={finishSliderZoomInteraction}
        onKeyDownCapture={() => {
          sliderKeyboardInputRef.current = true
        }}
        onKeyUpCapture={() => {
          // Keep the keyboard marker set through Radix's onValueCommit, which
          // runs later in this keyup event. The next microtask ends the input.
          queueMicrotask(() => {
            sliderKeyboardInputRef.current = false
          })
        }}
        onBlurCapture={() => {
          sliderKeyboardInputRef.current = false
        }}
        min={0}
        max={1}
        step={0.005}
        className="w-24"
        aria-label={t('timeline.header.zoomSlider')}
      />
      ) : null}

      <Button
        variant="ghost"
        size="icon"
        style={btnSize}
        onClick={onZoomIn ?? zoomIn}
        aria-label={t('timeline.header.zoomIn')}
        data-tooltip={t('timeline.header.zoomInTooltip')}
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        style={btnSize}
        onClick={onZoomToFit}
        aria-label={t('timeline.header.zoomToFit')}
        data-tooltip={t('timeline.header.zoomToFitTooltip')}
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  )
})

/**
 * Timeline Toolbar Component
 *
 * Unified toolbar for timeline controls:
 * - Select/Razor tools
 * - Undo/Redo
 * - In/Out points, Snap toggle
 * - Zoom controls
 */
export const TimelineHeader = memo(function TimelineHeader({
  beatvideoMode = 'video',
  simplifiedBeatvideo = false,
  compact = false,
  onZoomChange,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
}: TimelineHeaderProps) {
  const { t } = useTranslation()
  const isPhotoMode = beatvideoMode === 'photo'
  const isSimplified = simplifiedBeatvideo || isPhotoMode
  const hotkeys = useResolvedHotkeys()
  const snapEnabled = useTimelineStore((s) => s.snapEnabled)
  const toggleSnap = useTimelineStore((s) => s.toggleSnap)
  const beatGridVisible = useTimelineSettingsStore((s) => s.beatGridVisible)
  const toggleBeatGridVisible = useTimelineSettingsStore((s) => s.toggleBeatGridVisible)
  const beatGridSnapEnabled = useTimelineSettingsStore((s) => s.beatGridSnapEnabled)
  const toggleBeatGridSnap = useTimelineSettingsStore((s) => s.toggleBeatGridSnap)
  const beatGridResolution = useTimelineSettingsStore((s) => s.beatGridResolution)
  const setBeatGridResolution = useTimelineSettingsStore((s) => s.setBeatGridResolution)
  const audioSkimmingEnabled = useTimelineStore((s) => s.audioSkimmingEnabled)
  const toggleAudioSkimming = useTimelineStore((s) => s.toggleAudioSkimming)
  const inPoint = useTimelineStore((s) => s.inPoint)
  const outPoint = useTimelineStore((s) => s.outPoint)
  const setInPoint = useTimelineStore((s) => s.setInPoint)
  const setOutPoint = useTimelineStore((s) => s.setOutPoint)
  const clearInOutPoints = useTimelineStore((s) => s.clearInOutPoints)
  const addMarker = useTimelineStore((s) => s.addMarker)
  // Only subscribe to marker count for disabled state - avoids re-render on marker changes
  const hasMarkers = useTimelineStore((s) => s.markers.length > 0)
  const removeMarker = useTimelineStore((s) => s.removeMarker)
  const clearAllMarkers = useTimelineStore((s) => s.clearAllMarkers)
  // NOTE: Don't subscribe to currentFrame - only needed in click handlers
  // Read from store directly when needed to avoid re-renders every frame
  const activeTool = useSelectionStore((s) => s.activeTool)
  const setActiveTool = useSelectionStore((s) => s.setActiveTool)
  const selectedMarkerId = useSelectionStore((s) => s.selectedMarkerId)
  const inlineKeyframesOpen = useSelectionStore((s) => s.editKeyframePanelOpen)
  const toggleEditKeyframePanel = useSelectionStore((s) => s.toggleEditKeyframePanel)
  const clearSelection = useSelectionStore((s) => s.clearSelection)
  const linkedSelectionEnabled = useEditorStore((s) => s.linkedSelectionEnabled)
  const setLinkedSelectionEnabled = useEditorStore((s) => s.setLinkedSelectionEnabled)
  const canUndo = useTimelineCommandStore((s) => s.canUndo)
  const canRedo = useTimelineCommandStore((s) => s.canRedo)
  const undoLabel = useTimelineCommandStore((s) => s.getUndoLabel())
  const redoLabel = useTimelineCommandStore((s) => s.getRedoLabel())
  const SlipSlideFlyoutIcon = activeTool === 'slide' ? BetweenHorizontalEnd : ArrowRightLeft
  const beatGridResolutionLabel =
    BEAT_GRID_RESOLUTION_OPTIONS.find((option) => option.value === beatGridResolution)?.label ??
    'Auto'
  const musicalSnapEnabled = snapEnabled && beatGridSnapEnabled
  const producerZoomLevel = useZoomStore((state) => state.contentLevel)

  const toggleMusicalSnap = useCallback(() => {
    if (musicalSnapEnabled) {
      if (beatGridSnapEnabled) toggleBeatGridSnap()
      return
    }
    if (!snapEnabled) toggleSnap()
    if (!beatGridSnapEnabled) toggleBeatGridSnap()
  }, [
    beatGridSnapEnabled,
    musicalSnapEnabled,
    snapEnabled,
    toggleBeatGridSnap,
    toggleSnap,
  ])

  useEffect(() => {
    if (isSimplified && activeTool !== 'select' && activeTool !== 'razor') {
      setActiveTool('select')
    }
    if (isPhotoMode && activeTool === 'razor') {
      setActiveTool('select')
    }
  }, [activeTool, isPhotoMode, isSimplified, setActiveTool])

  const btnSize = {
    width: compact ? '36px' : EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize,
    height: compact ? '36px' : EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize,
  } as const

  const handleUndo = () => {
    useTimelineStore.temporal.getState().undo()
  }

  const handleRedo = () => {
    useTimelineStore.temporal.getState().redo()
  }

  if (isSimplified && !compact) {
    const producerZoomPercent = Math.round(producerZoomLevel * 100)
    const zoomOut = onZoomOut ?? useZoomStore.getState().zoomOut
    const zoomIn = onZoomIn ?? useZoomStore.getState().zoomIn

    return (
      <div
        className="relative h-[42px] shrink-0 bg-[#e8e9e5] text-[#171917]"
        role="toolbar"
        aria-label={t('timeline.header.controls')}
        data-studio-timeline-toolbar
      >
        <div className="absolute left-3 top-[15px] text-[10px] font-semibold uppercase leading-3">
          Sequence 01
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="absolute left-[660px] top-0 flex h-[42px] w-[50px] items-center text-left font-mono text-[10px] text-[#686d67] hover:text-[#171917]"
              aria-label={`Grid: ${beatGridResolutionLabel}`}
              data-tooltip="Musical grid"
            >
              {beatGridResolutionLabel} snap
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem onClick={toggleBeatGridVisible}>
              <span className="w-4 font-mono text-xs">{beatGridVisible ? '✓' : ''}</span>
              <span>Show grid</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={toggleMusicalSnap}>
              <span className="w-4 font-mono text-xs">{musicalSnapEnabled ? '✓' : ''}</span>
              <span>Snap to grid</span>
            </DropdownMenuItem>
            {BEAT_GRID_RESOLUTION_OPTIONS.map((option, index) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setBeatGridResolution(option.value as BeatGridResolution)}
                className={index === 0 ? 'border-t border-border/60' : ''}
              >
                <span className="w-4 font-mono text-xs">
                  {option.value === beatGridResolution ? '✓' : ''}
                </span>
                <span className="font-mono text-xs">{option.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="absolute left-[710px] top-0 flex h-[42px] w-[64px] items-center justify-between font-mono text-[10px]">
          <button
            type="button"
            onClick={zoomOut}
            className="h-full w-3 text-[#686d67] hover:text-[#171917]"
            aria-label={t('timeline.header.zoomOut')}
          >
            −
          </button>
          <span className="w-9 text-center tabular-nums">{producerZoomPercent}%</span>
          <button
            type="button"
            onClick={zoomIn}
            className="h-full w-3 text-[#686d67] hover:text-[#171917]"
            aria-label={t('timeline.header.zoomIn')}
          >
            +
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={
        compact
          ? 'flex items-center gap-1 border-b border-border px-1'
          : 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-3'
      }
      style={{ height: EDITOR_LAYOUT_CSS_VALUES.timelineHeaderHeight }}
      role="toolbar"
      aria-label={t('timeline.header.controls')}
      data-studio-timeline-toolbar
    >
      {/* The phone surface is already named Timeline in the persistent dock. */}
      {!compact ? (
        <div className="flex min-w-0 items-center">
          <h2 className="text-xs font-medium text-muted-foreground">
            {t('timeline.header.title')}
          </h2>
        </div>
      ) : null}

      {/* Middle: Timeline Controls */}
      <div className="min-w-0 overflow-x-auto overflow-y-hidden">
        <div
          className={
            compact
              ? 'flex w-max min-w-full items-center justify-start gap-1.5'
              : 'flex w-max min-w-full items-center justify-center gap-2.5'
          }
        >
          {/* Timeline Tools */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              style={btnSize}
              onClick={() => setActiveTool('select')}
              aria-pressed={activeTool === 'select'}
              aria-label={t('timeline.header.selectTool')}
              data-tooltip={t('timeline.header.selectToolTooltip')}
            >
              <MousePointer2 className="w-3.5 h-3.5" />
            </Button>

            {!isPhotoMode ? (
              <>
                {!isSimplified ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    style={btnSize}
                    onClick={() =>
                      setActiveTool(activeTool === 'trim-edit' ? 'select' : 'trim-edit')
                    }
                    aria-pressed={activeTool === 'trim-edit'}
                    aria-label={t('timeline.header.trimEditTool')}
                    data-tooltip={t('timeline.header.trimEditToolTooltip')}
                  >
                    <TrimEditIcon className="w-3.5 h-3.5" />
                  </Button>
                ) : null}

                <Button
                  variant="ghost"
                  size="icon"
                  style={btnSize}
                  onClick={() => setActiveTool(activeTool === 'razor' ? 'select' : 'razor')}
                  aria-pressed={activeTool === 'razor'}
                  aria-label={t('timeline.header.razorTool')}
                  data-tooltip={t('timeline.header.razorToolTooltip')}
                >
                  <Scissors className="w-3.5 h-3.5 -rotate-90" />
                </Button>

                {!isSimplified ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      style={btnSize}
                      onClick={() =>
                        setActiveTool(activeTool === 'rate-stretch' ? 'select' : 'rate-stretch')
                      }
                      aria-pressed={activeTool === 'rate-stretch'}
                      aria-label={t('timeline.header.rateStretchTool')}
                      data-tooltip={t('timeline.header.rateStretchToolTooltip')}
                    >
                      <Gauge className="w-3.5 h-3.5" />
                    </Button>

                    {SLIP_SLIDE_TOOLS_ENABLED ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            style={{ height: EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize }}
                            className="gap-1 px-2"
                            aria-pressed={activeTool === 'slip' || activeTool === 'slide'}
                            aria-label={t('timeline.header.slipSlideTools')}
                            data-tooltip={t('timeline.header.slipSlideToolsTooltip')}
                          >
                            <span className="flex items-center gap-1">
                              <span className="inline-flex items-center justify-center">
                                <SlipSlideFlyoutIcon className="w-3.5 h-3.5" />
                              </span>
                              <ChevronDown className="w-3 h-3 opacity-70" />
                            </span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem
                            onClick={() =>
                              setActiveTool(activeTool === 'slip' ? 'select' : 'slip')
                            }
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            <span className="flex-1">{t('timeline.header.slipTool')}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatHotkeyBinding(hotkeys.SLIP_TOOL)}
                            </span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              setActiveTool(activeTool === 'slide' ? 'select' : 'slide')
                            }
                          >
                            <BetweenHorizontalEnd className="w-3.5 h-3.5" />
                            <span className="flex-1">{t('timeline.header.slideTool')}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatHotkeyBinding(hotkeys.SLIDE_TOOL)}
                            </span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
          </div>

          <Separator orientation="vertical" className="h-5 mx-1.5" />

          {/* Undo/Redo */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              style={btnSize}
              onClick={handleUndo}
              disabled={!canUndo}
              aria-label={
                undoLabel
                  ? t('timeline.header.undoWithLabel', { label: undoLabel })
                  : t('timeline.header.undo')
              }
              data-tooltip={
                undoLabel
                  ? t('timeline.header.undoWithLabelTooltip', { label: undoLabel })
                  : t('timeline.header.undoTooltip')
              }
            >
              <Undo2 className="w-3.5 h-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              style={btnSize}
              onClick={handleRedo}
              disabled={!canRedo}
              aria-label={
                redoLabel
                  ? t('timeline.header.redoWithLabel', { label: redoLabel })
                  : t('timeline.header.redo')
              }
              data-tooltip={
                redoLabel
                  ? t('timeline.header.redoWithLabelTooltip', { label: redoLabel })
                  : t('timeline.header.redoTooltip')
              }
            >
              <Redo2 className="w-3.5 h-3.5" />
            </Button>
          </div>

          {!isSimplified ? (
            <>
            <Separator orientation="vertical" className="h-5 mx-1.5" />
  
            {/* In/Out Points */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                style={btnSize}
                onClick={() => setInPoint(usePlaybackStore.getState().currentFrame)}
                aria-label={t('timeline.header.setInPoint')}
                data-tooltip={t('timeline.header.setInPointTooltip')}
              >
                <span className="text-sm font-bold" style={{ color: 'var(--color-timeline-in)' }}>
                  [
                </span>
              </Button>
  
              <Button
                variant="ghost"
                size="icon"
                style={btnSize}
                onClick={() => setOutPoint(usePlaybackStore.getState().currentFrame)}
                aria-label={t('timeline.header.setOutPoint')}
                data-tooltip={t('timeline.header.setOutPointTooltip')}
              >
                <span className="text-sm font-bold" style={{ color: 'var(--color-timeline-out)' }}>
                  ]
                </span>
              </Button>
  
              <Button
                variant="ghost"
                size="icon"
                style={btnSize}
                onClick={clearInOutPoints}
                disabled={inPoint === null && outPoint === null}
                aria-label={t('timeline.header.clearInOutPoints')}
                data-tooltip={t('timeline.header.clearInOutPointsTooltip')}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
  
            <Separator orientation="vertical" className="h-5 mx-1.5" />
  
            {/* Markers */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                style={btnSize}
                onClick={() => addMarker(usePlaybackStore.getState().currentFrame)}
                aria-label={t('timeline.header.addMarker')}
                data-tooltip={t('timeline.header.addMarkerTooltip')}
              >
                <Flag className="w-3.5 h-3.5" style={{ color: 'var(--color-timeline-marker)' }} />
              </Button>
  
              <Button
                variant="ghost"
                size="icon"
                style={btnSize}
                onClick={() => {
                  if (selectedMarkerId) {
                    removeMarker(selectedMarkerId)
                    clearSelection()
                  }
                }}
                disabled={!selectedMarkerId}
                aria-label={t('timeline.header.removeSelectedMarker')}
                data-tooltip={t('timeline.header.removeSelectedMarkerTooltip')}
              >
                <FlagOff className="w-3.5 h-3.5" />
              </Button>
  
              <Button
                variant="ghost"
                size="icon"
                style={btnSize}
                onClick={clearAllMarkers}
                disabled={!hasMarkers}
                aria-label={t('timeline.header.clearAllMarkers')}
                data-tooltip={t('timeline.header.clearAllMarkersTooltip')}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
  
            <Separator orientation="vertical" className="h-5 mx-1.5" />
  
            {/* Microphone voiceover */}
            <MicRecordControl />
  
            <Separator orientation="vertical" className="h-5 mx-1.5" />
  
              </>
          ) : (
            <Separator orientation="vertical" className="h-5 mx-1.5" />
          )}

          {isSimplified ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                style={btnSize}
                onClick={toggleMusicalSnap}
                aria-label={musicalSnapEnabled ? 'Disable beat snap' : 'Enable beat snap'}
                aria-pressed={musicalSnapEnabled}
                data-tooltip={musicalSnapEnabled ? 'Beat snap on' : 'Beat snap off'}
              >
                <Magnet className="h-3.5 w-3.5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className={
                      compact
                        ? 'h-9 gap-1 px-2 font-mono text-xs text-foreground'
                        : 'h-7 gap-1 px-2 font-mono text-xs text-foreground'
                    }
                    aria-label={`Grid: ${beatGridResolutionLabel}`}
                    data-tooltip="Musical grid"
                  >
                    Grid {beatGridResolutionLabel}
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="min-w-40">
                  <DropdownMenuItem onClick={toggleBeatGridVisible}>
                    <span className="w-4 font-mono text-xs">{beatGridVisible ? '✓' : ''}</span>
                    <span>Show grid</span>
                  </DropdownMenuItem>
                  {BEAT_GRID_RESOLUTION_OPTIONS.map((option, index) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => setBeatGridResolution(option.value as BeatGridResolution)}
                      className={`${index === 0 ? 'border-t border-border/60' : ''} ${
                        option.value === beatGridResolution ? 'text-primary' : ''
                      }`}
                    >
                      <span className="w-4 font-mono text-xs">
                        {option.value === beatGridResolution ? '✓' : ''}
                      </span>
                      <span className="font-mono text-xs">{option.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              style={btnSize}
              onClick={toggleSnap}
              aria-pressed={snapEnabled}
              aria-label={
                snapEnabled
                  ? t('timeline.header.disableSnapping')
                  : t('timeline.header.enableSnapping')
              }
              data-tooltip={
                snapEnabled ? t('timeline.header.snapEnabled') : t('timeline.header.snapDisabled')
              }
            >
              <Magnet className="w-3.5 h-3.5" />
            </Button>
          )}

          {!isSimplified ? (
            <>
            <Button
              variant="ghost"
              size="icon"
              style={btnSize}
              onClick={toggleAudioSkimming}
              aria-label={
                audioSkimmingEnabled
                  ? t('timeline.header.disableAudioSkimming')
                  : t('timeline.header.enableAudioSkimming')
              }
              aria-pressed={audioSkimmingEnabled}
              data-tooltip={
                audioSkimmingEnabled
                  ? t('timeline.header.audioSkimmingEnabled')
                  : t('timeline.header.audioSkimmingDisabled')
              }
            >
              <Volume2 className="w-3.5 h-3.5" />
            </Button>
  
            <Separator orientation="vertical" className="h-5 mx-1.5" />
  
            <InlineKeyframesToggle isOpen={inlineKeyframesOpen} onToggle={toggleEditKeyframePanel} />
  
            <Button
              variant="ghost"
              size="icon"
              style={btnSize}
              onClick={() => setLinkedSelectionEnabled(!linkedSelectionEnabled)}
              aria-label={
                linkedSelectionEnabled
                  ? t('timeline.header.disableLinkedSelection')
                  : t('timeline.header.enableLinkedSelection')
              }
              aria-pressed={linkedSelectionEnabled}
              data-tooltip={t('timeline.header.linkedSelectionTooltip', {
                state: linkedSelectionEnabled
                  ? t('timeline.header.linkedSelectionOn')
                  : t('timeline.header.linkedSelectionOff'),
                shortcut: formatHotkeyBinding(hotkeys.TOGGLE_LINKED_SELECTION),
              })}
            >
              <Link2 className="w-3.5 h-3.5" />
            </Button>
              </>
          ) : null}
        </div>
      </div>

      <TimelineZoomControls
        compact={compact}
        onZoomChange={onZoomChange}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onZoomToFit={onZoomToFit}
      />
    </div>
  )
})
