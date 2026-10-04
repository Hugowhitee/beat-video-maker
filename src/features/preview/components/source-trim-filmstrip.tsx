import { useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFilmstrip } from '@/features/preview/deps/filmstrip'
import {
  frameFromSourceStripRatio,
  framePercentInSourceWindow,
  resolveSourceFilmstripWindow,
} from '../utils/source-filmstrip-geometry'

type Boundary = 'in' | 'out'
interface SourceTrimFilmstripProps {
  mediaId: string
  blobUrl: string | null
  durationInFrames: number
  fps: number
  inPoint: number | null
  outPoint: number | null
  onSeek: (frame: number) => void
  onPreview: (frame: number) => void
  onChangeIn: (frame: number) => number
  onChangeOut: (frame: number) => number
}

const SLOT_COUNT = 14
const ZOOM_LEVELS = [1, 2, 4, 8, 16, 32] as const

/**
 * Source-relative precision view backed by the canonical clip-filmstrip cache.
 * The overview and this zoom window share SourcePlayerStore In/Out values:
 * no duplicate shot, timeline or media-edit model is introduced.
 */
export function SourceTrimFilmstrip({
  mediaId,
  blobUrl,
  durationInFrames,
  fps,
  inPoint,
  outPoint,
  onSeek,
  onPreview,
  onChangeIn,
  onChangeOut,
}: SourceTrimFilmstripProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [zoomIndex, setZoomIndex] = useState(0)
  const [focus, setFocus] = useState<Boundary>('in')
  const zoom = ZOOM_LEVELS[zoomIndex] ?? 1
  const totalFrames = Math.max(1, durationInFrames)
  const safeFps = Math.max(1, fps)
  // Fix the window while a boundary is dragged: a moving ruler makes
  // frame-exact trimming impossible.
  const [focusFrame, setFocusFrame] = useState(() => inPoint ?? 0)
  const window = useMemo(
    () => resolveSourceFilmstripWindow(totalFrames, zoom, focusFrame),
    [totalFrames, zoom, focusFrame],
  )
  const focusBoundary = (boundary: Boundary) => {
    setFocus(boundary)
    setFocusFrame(
      boundary === 'in' ? (inPoint ?? 0) : Math.max(0, (outPoint ?? totalFrames) - 1),
    )
  }
  const slots = useMemo(
    () =>
      Array.from({ length: SLOT_COUNT }, (_, slot) =>
        Math.max(
          0,
          Math.min(
            Math.ceil(totalFrames / safeFps) - 1,
            Math.floor(
              (window.start + ((slot + 0.5) / SLOT_COUNT) * (window.end - window.start)) /
                safeFps,
            ),
          ),
        ),
      ),
    [safeFps, totalFrames, window],
  )
  const targetFrameIndices = useMemo(() => Array.from(new Set(slots)), [slots])
  const priorityWindow = useMemo(() => ({
    startTime: window.start / safeFps,
    endTime: window.end / safeFps,
  }), [safeFps, window])
  const { frames, isLoading } = useFilmstrip({
    mediaId,
    blobUrl,
    duration: totalFrames / safeFps,
    isVisible: true,
    enabled: Boolean(blobUrl),
    priorityWindow,
    targetFrameIndices,
  })
  const frameUrls = useMemo(() => new Map<number, string>(frames?.map((frame) => [frame.index, frame.url] as const)), [frames])
  const lastDragPreviewFrameRef = useRef<number | null>(null)
  const from = inPoint ?? 0
  const to = outPoint ?? totalFrames
  const inPct = framePercentInSourceWindow(window, from)
  const outPct = framePercentInSourceWindow(window, to)
  const leftDim = Math.min(inPct, outPct)
  const rightDim = 100 - Math.max(inPct, outPct)

  const frameFromPointer = (clientX: number, exclusiveEnd = false) => {
    const bounds = ref.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0) return null
    return frameFromSourceStripRatio(
      window,
      (clientX - bounds.left) / bounds.width,
      exclusiveEnd,
    )
  }

  const updateBoundary = (boundary: Boundary, clientX: number) => {
    const frame = frameFromPointer(clientX, boundary === 'out')
    if (frame === null) return
    // Preview exactly the frame accepted by the canonical In/Out clamping.
    const accepted = boundary === 'in' ? onChangeIn(frame) : onChangeOut(frame)
    const includedFrame = boundary === 'out' ? Math.max(0, accepted - 1) : accepted
    lastDragPreviewFrameRef.current = includedFrame
    onPreview(includedFrame)
  }

  const handleBoundaryPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    boundary: Boundary,
  ) => {
    event.stopPropagation()
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.dataset.dragging = boundary
    const current = boundary === 'in' ? (inPoint ?? 0) : Math.max(0, (outPoint ?? totalFrames) - 1)
    lastDragPreviewFrameRef.current = current
    onPreview(current)
  }
  const handleBoundaryPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const boundary = event.currentTarget.dataset.dragging
    if (boundary === 'in' || boundary === 'out') {
      updateBoundary(boundary, event.clientX)
    }
  }
  const handleBoundaryPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const lastPreview = lastDragPreviewFrameRef.current
    lastDragPreviewFrameRef.current = null
    delete event.currentTarget.dataset.dragging
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (lastPreview !== null) onSeek(lastPreview)
  }
  const handleBoundaryKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    boundary: Boundary,
  ) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.stopPropagation()
    event.preventDefault()
    const change = event.key === 'ArrowRight' ? 1 : -1
    if (boundary === 'in') {
      const next = Math.max(0, Math.min(totalFrames - 1, (inPoint ?? 0) + change))
      onSeek(onChangeIn(next))
    } else {
      const next = Math.max(1, Math.min(totalFrames, (outPoint ?? totalFrames) + change))
      onSeek(Math.max(0, onChangeOut(next) - 1))
    }
  }

  const marker = (boundary: Boundary, frame: number, percent: number) => {
    if (frame < window.start || frame > window.end) return null
    return (
      <button
        type="button"
        data-range-handle={boundary}
        key={boundary}
        aria-label={boundary === 'in' ? 'Source In frame' : 'Source Out frame'}
        className="absolute inset-y-0 z-20 w-3 cursor-col-resize touch-none border-x-2 border-primary bg-primary/15 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
        style={{ left: 'calc(' + percent + '% - 6px)' }}
        onPointerDown={(event) => handleBoundaryPointerDown(event, boundary)}
        onPointerMove={handleBoundaryPointerMove}
        onPointerUp={handleBoundaryPointerUp}
        onPointerCancel={handleBoundaryPointerUp}
        onLostPointerCapture={handleBoundaryPointerUp}
        onKeyDown={(event) => handleBoundaryKeyDown(event, boundary)}
      />
    )
  }

  return (
    <div
      className="flex shrink-0 flex-col gap-1.5 border-t border-border bg-background px-4 py-2"
      aria-label="Source precision trim"
      data-testid="source-precision-filmstrip"
    >
      <div className="flex min-h-8 items-center justify-between gap-3">
        <span className="shrink-0 text-xs font-medium text-foreground">SOURCE RANGE</span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={focus === 'in' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 px-2 text-xs"
            aria-pressed={focus === 'in'}
            onClick={() => focusBoundary('in')}
          >In</Button>
          <Button
            type="button"
            variant={focus === 'out' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 px-2 text-xs"
            aria-pressed={focus === 'out'}
            onClick={() => focusBoundary('out')}
          >Out</Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={zoomIndex === 0}
            aria-label="Zoom out source filmstrip"
            onClick={() => setZoomIndex((previous) => Math.max(0, previous - 1))}
          ><Minus className="h-4 w-4" /></Button>
          <span className="w-7 text-center font-mono text-xs tabular-nums">{zoom}×</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            aria-label="Zoom in source filmstrip"
            onClick={() => setZoomIndex((previous) => Math.min(ZOOM_LEVELS.length - 1, previous + 1))}
          ><Plus className="h-4 w-4" /></Button>
        </div>
      </div>
      <div
        ref={ref}
        role="group"
        aria-label="Zoomed source filmstrip"
        tabIndex={0}
        data-testid="source-filmstrip-zoom-track"
        className="relative h-14 cursor-crosshair touch-pan-y select-none overflow-hidden rounded-sm border border-border bg-muted"
        onPointerDown={(event) => {
          const frame = frameFromPointer(event.clientX)
          if (frame !== null) onSeek(frame)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Home' && event.key !== 'End') return
          event.preventDefault()
          onSeek(event.key === 'Home' ? window.start : window.end - 1)
        }}
      >
        <div className="pointer-events-none absolute inset-0 flex">
          {slots.map((index, slot) => (
            <div className="min-w-0 flex-1 overflow-hidden border-r border-background/30" key={slot}>
              {frameUrls.get(index) ? (
                <img src={frameUrls.get(index)} alt="" draggable={false} className="h-full w-full object-cover" />
              ) : (
                <div aria-hidden="true" className="h-full w-full bg-muted" />
              )}
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 bg-black/60"
          style={{ width: leftDim + '%' }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 bg-black/60"
          style={{ width: rightDim + '%' }} />
        <div className="pointer-events-none absolute inset-y-0 border-y-2 border-primary/70"
          style={{ left: inPct + '%', width: Math.max(0, outPct - inPct) + '%' }} />
        {inPoint !== null && marker('in', inPoint, inPct)}
        {outPoint !== null && marker('out', outPoint, outPct)}
      </div>
      <div className="flex justify-between gap-2 font-mono text-xs tabular-nums text-muted-foreground">
        <span>{(window.start / safeFps).toFixed(2)}s</span>
        <span className="truncate">
          {isLoading
            ? 'Loading frames…'
            : `In ${(from / safeFps).toFixed(2)}s · Out ${(to / safeFps).toFixed(2)}s · drag or use ← →`}
        </span>
        <span>{(window.end / safeFps).toFixed(2)}s</span>
      </div>
    </div>
  )
}
