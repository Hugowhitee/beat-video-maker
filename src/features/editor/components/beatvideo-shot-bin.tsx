import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type PointerEvent,
} from 'react'
import {
  resolveMediaUrl,
  useMediaLibraryStore,
} from '@/features/editor/deps/media-library'
import { useFilmstrip, type FilmstripFrame } from '@/features/editor/deps/timeline-hooks'
import type { ClipMap, ClipShot } from '@/features/editor/deps/auto-edit-contract'
import { useEditorStore } from '@/shared/state/editor'
import { usePlaybackStore } from '@/shared/state/playback'

export type BeatvideoVisualShot = ClipShot & {
  sourceName: string
}

function useSourceUrl(mediaId: string) {
  const [resolved, setResolved] = useState<{ id: string; url: string } | null>(null)
  const url = resolved?.id === mediaId ? resolved.url : null

  useEffect(() => {
    if (!mediaId || url) return
    let cancelled = false
    void resolveMediaUrl(mediaId)
      .then((next) => {
        if (!cancelled && next) setResolved({ id: mediaId, url: next })
      })
      .catch(() => {
        // A missing preview frame should never make the shot bin unusable.
      })
    return () => {
      cancelled = true
    }
  }, [mediaId, url])

  return url
}

function nearestFrame(frames: readonly FilmstripFrame[] | null, target: number) {
  if (!frames || frames.length === 0) return null
  let best: FilmstripFrame | null = null
  for (const frame of frames) {
    if (!best || Math.abs(frame.index - target) < Math.abs(best.index - target)) {
      best = frame
    }
  }
  return best?.url ?? null
}

export function BeatvideoShotFrame({
  shot,
  sourceDuration,
  className = '',
}: {
  shot: Pick<ClipShot, 'sourceId' | 'start' | 'end'>
  sourceDuration: number
  className?: string
}) {
  const blobUrl = useSourceUrl(shot.sourceId)
  const midpoint = Math.max(0, Math.min(sourceDuration, (shot.start + shot.end) / 2))
  const frameIndex = Math.max(0, Math.floor(midpoint))
  const targetFrameIndices = useMemo(() => [frameIndex], [frameIndex])
  const priorityWindow = useMemo(
    () => ({
      startTime: Math.max(0, midpoint - 0.5),
      endTime: Math.min(sourceDuration, midpoint + 0.5),
    }),
    [midpoint, sourceDuration],
  )
  const { frames } = useFilmstrip({
    mediaId: shot.sourceId,
    blobUrl,
    duration: sourceDuration,
    isVisible: true,
    enabled: sourceDuration > 0,
    priorityWindow,
    targetFrameIndices,
  })
  const frameUrl = useMemo(
    () => nearestFrame(frames, frameIndex),
    [frames, frameIndex],
  )

  return (
    <div
      className={`relative overflow-hidden bg-muted/45 ${className}`}
      aria-hidden="true"
    >
      {frameUrl ? (
        <img
          src={frameUrl}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_42%,color-mix(in_oklab,var(--border)_65%,transparent)_43%,color-mix(in_oklab,var(--border)_65%,transparent)_47%,transparent_48%)]" />
      )}
    </div>
  )
}

export function BeatvideoShotBin({
  clipMap,
  excludedShotIds,
  draggingShotId,
  onToggleAvoid,
  onDragStart,
  onDragEnd,
}: {
  clipMap: ClipMap
  excludedShotIds: readonly string[]
  draggingShotId: string | null
  onToggleAvoid: (shotId: string) => void
  onDragStart: (event: DragEvent<HTMLElement>, shotId: string) => void
  onDragEnd: () => void
}) {
  const sourceIds = useMemo(() => clipMap.sources.map((source) => source.id), [clipMap])
  const mediaById = useMediaLibraryStore((state) => state.mediaById)
  const [activeSourceId, setActiveSourceId] = useState<string | null>(
    clipMap.sources[0]?.id ?? null,
  )

  const setMediaSkimPreview = useEditorStore((state) => state.setMediaSkimPreview)

  const previewShotAtPointer = useCallback(
    (event: PointerEvent<HTMLDivElement>, shot: ClipShot) => {
      const media = mediaById[shot.sourceId]
      if (!media || media.fps <= 0) return

      const rect = event.currentTarget.getBoundingClientRect()
      if (rect.width <= 0) return
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
      const sourceTime = shot.start + (shot.end - shot.start) * ratio
      const sourceFrame = Math.max(0, Math.round(sourceTime * media.fps))

      const playback = usePlaybackStore.getState()
      if (playback.isPlaying) playback.pause()
      playback.setPreviewFrame(null)
      setMediaSkimPreview(shot.sourceId, sourceFrame)
    },
    [mediaById, setMediaSkimPreview],
  )

  const clearShotPreview = useCallback(() => {
    setMediaSkimPreview(null)
  }, [setMediaSkimPreview])

  useEffect(() => {
    if (activeSourceId && sourceIds.includes(activeSourceId)) return
    setActiveSourceId(sourceIds[0] ?? null)
  }, [activeSourceId, sourceIds])

  const activeSource =
    clipMap.sources.find((source) => source.id === activeSourceId) ??
    clipMap.sources[0] ??
    null
  return (
    <div data-beatvideo-shot-bin>
      {clipMap.sources.length > 1 ? (
        <div
          className="studio-segmented mb-1.5 flex max-w-full overflow-x-auto"
          role="tablist"
          aria-label="Footage sources"
        >
          {clipMap.sources.map((source) => (
            <button
              key={source.id}
              type="button"
              role="tab"
              aria-selected={source.id === activeSource?.id}
              onClick={() => setActiveSourceId(source.id)}
              className="studio-segment h-7 shrink-0 px-2 text-[9px] font-medium"
            >
              {source.name} · {source.shots.length}
            </button>
          ))}
        </div>
      ) : activeSource ? (
        <div className="mb-1.5 truncate text-[9px] text-muted-foreground">
          {activeSource.name} · {activeSource.shots.length} shot{activeSource.shots.length === 1 ? '' : 's'}
        </div>
      ) : null}

      {activeSource ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {activeSource.shots.map((shot, index) => {
            const avoided = excludedShotIds.includes(shot.id)
            const dragging = draggingShotId === shot.id
            const sourceDuration =
              mediaById[activeSource.id]?.duration ?? activeSource.duration

            return (
              <div
                key={shot.id}
                draggable
                tabIndex={0}
                aria-label={`Shot ${index + 1} from ${activeSource.name}. Drag onto a sequence slot.`}
                title="Hover to scrub · drag onto a sequence slot"
                onPointerEnter={(event) => previewShotAtPointer(event, shot)}
                onPointerMove={(event) => previewShotAtPointer(event, shot)}
                onPointerLeave={clearShotPreview}
                onDragStart={(event) => {
                  clearShotPreview()
                  onDragStart(event, shot.id)
                }}
                onDragEnd={() => {
                  clearShotPreview()
                  onDragEnd()
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  onToggleAvoid(shot.id)
                }}
                className={`group relative w-28 shrink-0 cursor-grab border bg-background outline-none active:cursor-grabbing focus-visible:border-primary ${
                  dragging
                    ? 'border-primary'
                    : avoided
                      ? 'border-border/50 opacity-50'
                      : 'border-border/80 hover:border-primary/45'
                }`}
              >
                <BeatvideoShotFrame
                  shot={shot}
                  sourceDuration={sourceDuration}
                  className="aspect-video w-full"
                />
                <div className="flex items-center justify-between gap-1 border-t border-border/60 px-1.5 py-1">
                  <span className="font-mono text-[8px] text-foreground/80">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="font-mono text-[8px] text-muted-foreground">
                    {shot.start.toFixed(1)}–{shot.end.toFixed(1)}s
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleAvoid(shot.id)
                    }}
                    className={
                      avoided
                        ? 'text-[8px] font-medium text-amber-300 hover:text-amber-200'
                        : 'text-[8px] text-muted-foreground hover:text-foreground'
                    }
                    aria-label={avoided ? 'Use shot on rebuild' : 'Skip shot on rebuild'}
                  >
                    {avoided ? 'Use' : 'Skip'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="py-2 text-[9px] text-muted-foreground">No shots detected.</div>
      )}
    </div>
  )
}
