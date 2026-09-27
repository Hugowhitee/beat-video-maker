import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Film, ImagePlus, Repeat2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  applyEditPlanToFreeCutTimeline,
  buildClipMapForMedia,
  createEditPlan,
  createSingleClipLoopPlan,
  offsetEditPlanTimeline,
  type ClipMapBuildProgress,
} from '@/features/editor/deps/auto-edit-contract'
import { resolveBeatvideoTimelineGrid } from '@/features/editor/deps/beatvideo-music'
import { useMediaLibraryStore } from '@/features/editor/deps/media-library'
import { useProjectStore } from '@/features/editor/deps/projects'
import {
  useItemsStore,
  useTimelineSettingsStore,
  useTimelineStore,
} from '@/features/editor/deps/timeline-store'
import { useSelectionStore } from '@/shared/state/selection'
import type { BeatvideoProjectMode } from '@/types/project'
import type { MusicMap } from '@/types/beatvideo'

interface BeatvideoVisualSourcePanelProps {
  beatvideoMode: BeatvideoProjectMode
  importingPhotoCover: boolean
  onImportPhotoCover: () => void | Promise<void>
  onFitPhotoCoverToBeat: () => void
}

export function BeatvideoVisualSourcePanel({
  beatvideoMode,
  importingPhotoCover,
  onImportPhotoCover,
  onFitPhotoCoverToBeat,
}: BeatvideoVisualSourcePanelProps) {
  const mediaItems = useMediaLibraryStore((state) => state.mediaItems)
  const currentProject = useProjectStore((state) => state.currentProject)
  const items = useItemsStore((state) => state.items)
  const fps = useTimelineSettingsStore((state) => state.fps)
  const [selectedLoopMediaId, setSelectedLoopMediaId] = useState('')
  const [importingFootage, setImportingFootage] = useState(false)
  const [preparingFootage, setPreparingFootage] = useState(false)
  const [autoArranging, setAutoArranging] = useState(false)
  const [progressLabel, setProgressLabel] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const analysis = currentProject?.beatvideoMusic
  const timelineGrid = useMemo(
    () => (analysis ? resolveBeatvideoTimelineGrid(analysis, items, fps) : null),
    [analysis, fps, items],
  )
  const videoCandidates = useMemo(
    () => mediaItems.filter((media) => media.mimeType.startsWith('video/')),
    [mediaItems],
  )

  useEffect(() => {
    if (!videoCandidates.some((media) => media.id === selectedLoopMediaId)) {
      setSelectedLoopMediaId(videoCandidates[0]?.id ?? '')
    }
  }, [selectedLoopMediaId, videoCandidates])

  useEffect(() => () => abortRef.current?.abort(), [])

  const describeProgress = useCallback((next: ClipMapBuildProgress) => {
    const sourceNumber = Math.min(next.totalSources, next.completedSources + 1)
    if (next.phase === 'analyzing') {
      setProgressLabel(
        `Analyzing ${sourceNumber}/${next.totalSources} · ${Math.round(next.analysisPercent ?? 0)}%`,
      )
      return
    }
    if (next.phase === 'ready') {
      setProgressLabel(`Footage ${next.completedSources}/${next.totalSources} ready`)
      return
    }
    setProgressLabel(`Reading footage ${sourceNumber}/${next.totalSources}`)
  }, [])

  const importFootage = useCallback(async () => {
    if (importingFootage || preparingFootage || autoArranging) return
    setImportingFootage(true)
    try {
      const imported = await useMediaLibraryStore.getState().importMedia({ storageMode: 'copy' })
      const videos = imported.filter((media) => media.mimeType.startsWith('video/'))
      if (videos.length === 0) {
        if (imported.length > 0) toast.warning('Choose one or more video files')
        return
      }

      setSelectedLoopMediaId(videos[0]!.id)
      setPreparingFootage(true)
      setProgressLabel('Analyzing footage…')
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      await buildClipMapForMedia({
        media: videos,
        analyzeMissing: true,
        signal: controller.signal,
        onProgress: describeProgress,
      })
      toast.success(
        videos.length === 1
          ? 'Footage ready'
          : `${videos.length} footage clips ready`,
      )
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error('Could not prepare footage', {
          description: error instanceof Error ? error.message : String(error),
        })
      }
    } finally {
      setImportingFootage(false)
      setPreparingFootage(false)
      setProgressLabel(null)
    }
  }, [autoArranging, describeProgress, importingFootage, preparingFootage])

  const autoArrangeFootage = useCallback(async () => {
    if (autoArranging || preparingFootage) return
    if (!timelineGrid) {
      toast.error('Analyze and place the beat before Auto Arrange')
      return
    }
    if (videoCandidates.length === 0) {
      toast.error('Add footage first')
      return
    }

    const timelineStart = timelineGrid.placement.from / fps
    const timelineDuration = timelineGrid.placement.durationInFrames / fps
    const rangeEnd = timelineStart + timelineDuration
    const relativeMusic: MusicMap = {
      ...timelineGrid.grid,
      duration: timelineDuration,
      beats: timelineGrid.grid.beats
        .filter((beat) => beat.time >= timelineStart - 1e-6 && beat.time <= rangeEnd + 1e-6)
        .map((beat) => ({ ...beat, time: Math.max(0, beat.time - timelineStart) })),
      sections: timelineGrid.grid.sections
        .filter(
          (section) =>
            section.end > timelineStart + 1e-6 && section.start < rangeEnd - 1e-6,
        )
        .map((section) => ({
          ...section,
          start: Math.max(0, section.start - timelineStart),
          end: Math.min(timelineDuration, section.end - timelineStart),
        }))
        .filter((section) => section.end > section.start + 1e-6),
    }

    if (relativeMusic.beats.length === 0) {
      toast.error('The placed beat has no usable grid points')
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setAutoArranging(true)
    setProgressLabel('Preparing footage…')
    try {
      const clipMap = await buildClipMapForMedia({
        media: videoCandidates,
        analyzeMissing: true,
        signal: controller.signal,
        onProgress: describeProgress,
      })
      const relativePlan = createEditPlan(relativeMusic, clipMap, {
        mode: 'auto',
        transitionProfile: 'mixed',
        seed: 1,
      })
      const result = await applyEditPlanToFreeCutTimeline(
        offsetEditPlanTimeline(relativePlan, timelineStart),
      )

      useSelectionStore.getState().setActiveTrack(result.targetVideoTrackId)
      useSelectionStore.getState().selectItems(result.itemIds)
      toast.success(
        `Auto arranged ${result.itemIds.length} clip${result.itemIds.length === 1 ? '' : 's'}`,
        {
          description:
            result.warnings[0] ??
            `Built from ${clipMap.sources.length} analyzed source${clipMap.sources.length === 1 ? '' : 's'}.`,
        },
      )
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error('Could not auto arrange footage', {
          description: error instanceof Error ? error.message : String(error),
        })
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setAutoArranging(false)
      setProgressLabel(null)
    }
  }, [
    autoArranging,
    describeProgress,
    fps,
    preparingFootage,
    timelineGrid,
    videoCandidates,
  ])

  const loopVideoToBeat = useCallback(async () => {
    const media = videoCandidates.find((candidate) => candidate.id === selectedLoopMediaId)
    if (!media || media.duration <= 0) {
      toast.error('Choose a video clip first')
      return
    }

    const timeline = useTimelineStore.getState()
    const beatPlacement =
      timelineGrid?.placement ??
      [...timeline.items]
        .filter((item) => item.type === 'audio')
        .sort((left, right) => right.durationInFrames - left.durationInFrames)[0]

    if (!beatPlacement) {
      toast.error('Place the beat on the timeline first')
      return
    }

    try {
      const result = await applyEditPlanToFreeCutTimeline(
        createSingleClipLoopPlan({
          sourceId: media.id,
          sourceDuration: media.duration,
          timelineStart: beatPlacement.from / timeline.fps,
          timelineDuration: beatPlacement.durationInFrames / timeline.fps,
        }),
      )
      useSelectionStore.getState().setActiveTrack(result.targetVideoTrackId)
      useSelectionStore.getState().selectItems(result.itemIds)
      toast.success(
        result.itemIds.length === 1
          ? 'Video fitted to beat'
          : `Video looped across beat · ${result.itemIds.length} clips`,
      )
    } catch (error) {
      toast.error('Could not build the video loop', {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }, [selectedLoopMediaId, timelineGrid, videoCandidates])

  if (beatvideoMode === 'photo') {
    return (
      <section className="space-y-2 border-b border-border bg-secondary/10 px-3 py-3">
        <div className="flex items-center gap-2">
          <ImagePlus className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Visual source</span>
        </div>
        <Button
          type="button"
          size="sm"
          className="w-full justify-start"
          disabled={importingPhotoCover}
          onClick={() => void onImportPhotoCover()}
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {importingPhotoCover ? 'Adding photo…' : 'Add or replace photo'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full justify-start"
          onClick={onFitPhotoCoverToBeat}
        >
          Fit photo to full beat
        </Button>
      </section>
    )
  }

  return (
    <section className="space-y-2 border-b border-border bg-secondary/10 px-3 py-3">
      <div className="flex items-center gap-2">
        <Film className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">Visual source</span>
      </div>

      <Button
        type="button"
        size="sm"
        className="w-full justify-start"
        disabled={importingFootage || preparingFootage || autoArranging}
        onClick={() => void importFootage()}
      >
        <Film className="h-3.5 w-3.5" />
        {importingFootage ? 'Importing footage…' : 'Add footage'}
      </Button>

      {videoCandidates.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="justify-start"
              disabled={!timelineGrid || preparingFootage || autoArranging}
              onClick={() => void autoArrangeFootage()}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {autoArranging ? 'Arranging…' : 'Auto arrange'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="justify-start"
              disabled={preparingFootage || autoArranging}
              onClick={() => void loopVideoToBeat()}
            >
              <Repeat2 className="h-3.5 w-3.5" />
              Loop clip
            </Button>
          </div>
          <select
            value={selectedLoopMediaId}
            onChange={(event) => setSelectedLoopMediaId(event.target.value)}
            className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
            aria-label="Clip used by Loop clip"
          >
            {videoCandidates.map((media) => (
              <option key={media.id} value={media.id}>
                {media.fileName}
              </option>
            ))}
          </select>
        </>
      ) : null}

      {progressLabel ? (
        <div className="font-mono text-[9px] text-muted-foreground">{progressLabel}</div>
      ) : null}
      <p className="text-[9px] leading-relaxed text-muted-foreground">
        Auto arrange analyzes shot changes and fills the verified beat. For manual cuts, drag any
        video below onto the timeline.
      </p>
    </section>
  )
}
