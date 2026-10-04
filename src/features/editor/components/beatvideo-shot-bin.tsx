import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  onOpenShot,
  onDragStart,
  onDragEnd,
}: {
  clipMap: ClipMap
  excludedShotIds: readonly string[]
  draggingShotId: string | null
  onToggleAvoid: (shotId: string) => void
  onOpenShot: (shot: ClipShot) => void
  onDragStart: (event: DragEvent<HTMLElement>, shotId: string) => void
  onDragEnd: () => void
}) {
  const mediaById = useMediaLibraryStore((state) => state.mediaById)
  const setMediaSkimPreview = useEditorStore((state) => state.setMediaSkimPreview)
  const openedShotRef = useRef<string | null>(null)

  const previewShotAtPointer = useCallback(
    (event: PointerEvent<HTMLDivElement>, shot: ClipShot) => {
      if (openedShotRef.current === shot.id) return
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

  return (
    <div data-beatvideo-shot-bin>
      {clipMap.sources.length > 0 ? (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {clipMap.sources.map((source) => {
            const sourceDuration = mediaById[source.id]?.duration ?? source.duration
            const skippedCount = source.shots.filter((shot) =>
              excludedShotIds.includes(shot.id),
            ).length

            return (
              <section
                key={source.id}
                className="border border-border/70 bg-background/35"
                aria-label={`${source.name} shots`}
              >
                <div className="flex h-7 min-w-0 items-center gap-2 border-b border-border/70 px-2">
                  <span className="h-2 w-2 shrink-0 rounded-[2px] bg-primary/70" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[9px] font-medium text-foreground">
                    {source.name}
                  </span>
                  <span className="shrink-0 font-mono text-[8px] tabular-nums text-muted-foreground">
                    {source.shots.length} shot{source.shots.length === 1 ? '' : 's'}
                    {skippedCount > 0 ? ` · ${skippedCount} skipped` : ''}
                  </span>
                </div>

                <div className="flex gap-1.5 overflow-x-auto p-1.5">
                  {source.shots.map((shot, index) => {
                    const avoided = excludedShotIds.includes(shot.id)
                    const dragging = draggingShotId === shot.id

                    return (
                      <div
                        key={shot.id}
                        draggable
                        tabIndex={0}
                        aria-label={`Shot ${index + 1} from ${source.name}. Drag onto a sequence slot.`}
                        title="Click to play and trim in Source · drag onto a sequence clip"
                        onClick={() => {
                          openedShotRef.current = shot.id
                          clearShotPreview()
                          onOpenShot(shot)
                        }}
                        onPointerEnter={(event) => previewShotAtPointer(event, shot)}
                        onPointerMove={(event) => previewShotAtPointer(event, shot)}
                        onPointerLeave={() => {
                          openedShotRef.current = null
                          clearShotPreview()
                        }}
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
                          if (event.key === 'Enter') {
                            openedShotRef.current = shot.id
                            clearShotPreview()
                            onOpenShot(shot)
                          } else {
                            onToggleAvoid(shot.id)
                          }
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
              </section>
            )
          })}
        </div>
      ) : (
        <div className="py-2 text-[9px] text-muted-foreground">No shots detected.</div>
      )}
    </div>
  )
}
