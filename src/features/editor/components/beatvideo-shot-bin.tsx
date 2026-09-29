import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { Folder, FolderOpen } from 'lucide-react'
import {
  resolveMediaUrl,
  useMediaLibraryStore,
} from '@/features/editor/deps/media-library'
import { useFilmstrip, type FilmstripFrame } from '@/features/editor/deps/timeline-hooks'
import type { ClipMap, ClipShot } from '@/features/editor/deps/auto-edit-contract'

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
  const [openSourceId, setOpenSourceId] = useState<string | null>(
    clipMap.sources[0]?.id ?? null,
  )

  useEffect(() => {
    if (openSourceId && sourceIds.includes(openSourceId)) return
    setOpenSourceId(sourceIds[0] ?? null)
  }, [openSourceId, sourceIds])

  const shotCount = clipMap.sources.reduce((total, source) => total + source.shots.length, 0)

  return (
    <div className="border-t border-border/80 pt-2" data-beatvideo-shot-bin>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-foreground">Detected shots</span>
        <span className="font-mono text-[9px] text-muted-foreground">{shotCount}</span>
      </div>

      <div className="divide-y divide-border/70 border-y border-border/70">
        {clipMap.sources.map((source) => {
          const open = openSourceId === source.id
          const sourceDuration = mediaById[source.id]?.duration ?? source.duration
          const firstShot = source.shots[0]

          return (
            <div key={source.id}>
              <button
                type="button"
                onClick={() => setOpenSourceId(open ? null : source.id)}
                aria-expanded={open}
                className="flex h-11 w-full items-center gap-2 px-1 text-left hover:bg-secondary/25"
              >
                {firstShot ? (
                  <BeatvideoShotFrame
                    shot={firstShot}
                    sourceDuration={sourceDuration}
                    className="h-8 w-12 shrink-0"
                  />
                ) : (
                  <div className="h-8 w-12 shrink-0 bg-muted/40" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10px] font-medium text-foreground">
                    {source.name}
                  </span>
                  <span className="block font-mono text-[8px] text-muted-foreground">
                    {source.shots.length} shot{source.shots.length === 1 ? '' : 's'}
                  </span>
                </span>
                {open ? (
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
              </button>

              {open ? (
                <div className="flex gap-1 overflow-x-auto border-t border-border/60 bg-background/30 p-1.5">
                  {source.shots.map((shot, index) => {
                    const avoided = excludedShotIds.includes(shot.id)
                    const dragging = draggingShotId === shot.id
                    return (
                      <div
                        key={shot.id}
                        draggable
                        role="button"
                        tabIndex={0}
                        aria-label={`Drag shot ${index + 1} from ${source.name} onto an arrangement slot`}
                        title="Drag onto an arrangement slot"
                        onDragStart={(event) => onDragStart(event, shot.id)}
                        onDragEnd={onDragEnd}
                        onDoubleClick={() => onToggleAvoid(shot.id)}
                        className={`group relative w-24 shrink-0 cursor-grab border bg-background active:cursor-grabbing ${
                          dragging
                            ? 'border-primary'
                            : avoided
                              ? 'border-border/50 opacity-45'
                              : 'border-border/80 hover:border-primary/45'
                        }`}
                      >
                        <BeatvideoShotFrame
                          shot={shot}
                          sourceDuration={sourceDuration}
                          className="aspect-video w-full"
                        />
                        <div className="flex items-center justify-between gap-1 px-1 py-1">
                          <span className="font-mono text-[8px] text-foreground/75">
                            #{index + 1}
                          </span>
                          <span className="font-mono text-[8px] text-muted-foreground">
                            {(shot.end - shot.start).toFixed(1)}s
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onToggleAvoid(shot.id)
                          }}
                          className={`absolute right-1 top-1 border px-1 py-0.5 font-mono text-[7px] leading-none opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${
                            avoided
                              ? 'border-amber-400/50 bg-background/90 text-amber-300 opacity-100'
                              : 'border-border/70 bg-background/90 text-muted-foreground'
                          }`}
                          aria-label={avoided ? 'Allow shot on rebuild' : 'Avoid shot on rebuild'}
                        >
                          {avoided ? 'Avoided' : 'Avoid'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <p className="mt-1.5 text-[8px] leading-relaxed text-muted-foreground">
        Drag a shot onto a slot. The cut stays on the corrected music grid.
      </p>
    </div>
  )
}
