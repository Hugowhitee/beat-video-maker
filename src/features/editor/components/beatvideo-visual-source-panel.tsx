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
  replaceSegmentSource,
  type ClipMap,
  type ClipMapBuildProgress,
  type EditPace,
  type EditPlan,
  type TransitionProfile,
} from '@/features/editor/deps/auto-edit-contract'
import { resolveBeatvideoTimelineGrid } from '@/features/editor/deps/beatvideo-music'
import { useMediaLibraryStore } from '@/features/editor/deps/media-library'
import { useProjectStore } from '@/features/editor/deps/projects'
import {
  createLinkedPreCompPattern,
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

type ArrangeMode = 'auto' | 'loop'

function segmentDuration(segment: EditPlan['segments'][number]) {
  return segment.timelineEnd - segment.timelineStart
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

  const [arrangeMode, setArrangeMode] = useState<ArrangeMode>('auto')
  const [arrangePace, setArrangePace] = useState<EditPace>('balanced')
  const [transitionProfile, setTransitionProfile] =
    useState<TransitionProfile>('clean')
  const [loopBars, setLoopBars] = useState(4)
  const [excludedShotIds, setExcludedShotIds] = useState<string[]>([])

  const [lastClipMap, setLastClipMap] = useState<ClipMap | null>(null)
  const [lastPlan, setLastPlan] = useState<EditPlan | null>(null)
  const [lastAppliedItemIds, setLastAppliedItemIds] = useState<string[]>([])
  const [lastItemIdBySegmentId, setLastItemIdBySegmentId] = useState<
    Record<string, string>
  >({})
  const [lastTargetVideoTrackId, setLastTargetVideoTrackId] = useState<string | null>(
    null,
  )
  const [loopBlocksGrouped, setLoopBlocksGrouped] = useState(false)
  const [groupedLoopWrapperIds, setGroupedLoopWrapperIds] = useState<string[]>([])
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

  const shotById = useMemo(
    () =>
      new Map(
        (lastClipMap?.sources ?? []).flatMap((source) =>
          source.shots.map((shot) => [
            shot.id,
            { ...shot, sourceName: source.name },
          ] as const),
        ),
      ),
    [lastClipMap],
  )

  const editableArrangementSlots = useMemo(() => {
    if (!lastPlan || !lastClipMap || loopBlocksGrouped) return []
    const seen = new Set<string>()

    return lastPlan.segments.flatMap((segment) => {
      const key = segment.motifSlot ?? segment.id
      if (seen.has(key)) return []
      seen.add(key)
      const shot = shotById.get(segment.shotId)
      const duration = segmentDuration(segment)
      const alternatives = lastClipMap.sources.flatMap((source) =>
        source.shots
          .filter(
            (candidate) =>
              candidate.end - candidate.start >= duration - 1e-6 &&
              (!excludedShotIds.includes(candidate.id) || candidate.id === segment.shotId),
          )
          .map((candidate) => ({
            ...candidate,
            sourceName: source.name,
          })),
      )

      return [
        {
          key,
          segment,
          shot,
          alternatives,
          linkedRepeats: segment.motifSlot
            ? lastPlan.segments.filter(
                (candidate) =>
                  candidate.motifId === segment.motifId &&
                  candidate.motifSlot === segment.motifSlot,
              ).length
            : 1,
        },
      ]
    })
  }, [excludedShotIds, lastClipMap, lastPlan, loopBlocksGrouped, shotById])

  useEffect(() => {
    if (!videoCandidates.some((media) => media.id === selectedLoopMediaId)) {
      setSelectedLoopMediaId(videoCandidates[0]?.id ?? '')
    }
  }, [selectedLoopMediaId, videoCandidates])

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    if (!loopBlocksGrouped || groupedLoopWrapperIds.length === 0) return
    const rootIds = new Set(items.map((item) => item.id))
    const wrappersGone = groupedLoopWrapperIds.every((id) => !rootIds.has(id))
    const originalCutsRestored = lastAppliedItemIds.some((id) => rootIds.has(id))
    if (wrappersGone && originalCutsRestored) {
      setLoopBlocksGrouped(false)
      setGroupedLoopWrapperIds([])
    }
  }, [
    groupedLoopWrapperIds,
    items,
    lastAppliedItemIds,
    loopBlocksGrouped,
  ])

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
      const clipMap = await buildClipMapForMedia({
        media: videos,
        analyzeMissing: true,
        signal: controller.signal,
        onProgress: describeProgress,
      })
      setLastClipMap(clipMap)
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

  const resolveRelativeMusic = useCallback((): {
    timelineStart: number
    timelineDuration: number
    music: MusicMap
  } | null => {
    if (!timelineGrid) return null
    const timelineStart = timelineGrid.placement.from / fps
    const timelineDuration = timelineGrid.placement.durationInFrames / fps
    const rangeEnd = timelineStart + timelineDuration

    const music: MusicMap = {
      ...timelineGrid.grid,
      duration: timelineDuration,
      beats: timelineGrid.grid.beats
        .filter(
          (beat) =>
            beat.time >= timelineStart - 1e-6 &&
            beat.time <= rangeEnd + 1e-6,
        )
        .map((beat) => ({
          ...beat,
          time: Math.max(0, beat.time - timelineStart),
        })),
      sections: timelineGrid.grid.sections
        .filter(
          (section) =>
            section.end > timelineStart + 1e-6 &&
            section.start < rangeEnd - 1e-6,
        )
        .map((section) => ({
          ...section,
          start: Math.max(0, section.start - timelineStart),
          end: Math.min(timelineDuration, section.end - timelineStart),
        }))
        .filter((section) => section.end > section.start + 1e-6),
    }

    return { timelineStart, timelineDuration, music }
  }, [fps, timelineGrid])

  const applyArrangement = useCallback(
    async (plan: EditPlan, clipMap: ClipMap) => {
      const result = await applyEditPlanToFreeCutTimeline(plan, {
        preferredVideoTrackId: lastTargetVideoTrackId ?? undefined,
        replaceItemIds: lastAppliedItemIds,
      })
      setLastPlan(plan)
      setLastClipMap(clipMap)
      setLastAppliedItemIds(result.itemIds)
      setLastItemIdBySegmentId(result.itemIdBySegmentId)
      setLastTargetVideoTrackId(result.targetVideoTrackId)
      setLoopBlocksGrouped(false)
      setGroupedLoopWrapperIds([])

      useSelectionStore.getState().setActiveTrack(result.targetVideoTrackId)
      useSelectionStore.getState().selectItems(result.itemIds)
      return result
    },
    [lastAppliedItemIds, lastTargetVideoTrackId],
  )

  const autoArrangeFootage = useCallback(async () => {
    if (autoArranging || preparingFootage) return
    const relative = resolveRelativeMusic()
    if (!relative) {
      toast.error('Analyze and place the beat before Auto Arrange')
      return
    }
    if (relative.music.beats.length === 0) {
      toast.error('The placed beat has no usable grid points')
      return
    }
    if (videoCandidates.length === 0) {
      toast.error('Add footage first')
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
      const relativePlan = createEditPlan(relative.music, clipMap, {
        mode: arrangeMode,
        pace: arrangePace,
        loopBars,
        transitionProfile,
        excludedShotIds,
        seed: 1,
      })
      const plan = offsetEditPlanTimeline(relativePlan, relative.timelineStart)
      const result = await applyArrangement(plan, clipMap)

      toast.success(
        arrangeMode === 'loop'
          ? `Built repeating ${loopBars}-bar motif · ${result.itemIds.length} cuts`
          : `Auto arranged ${result.itemIds.length} clip${result.itemIds.length === 1 ? '' : 's'}`,
        {
          description:
            result.warnings[0] ??
            'Every generated internal cut is locked to the corrected visible beat grid.',
        },
      )
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error('Could not build arrangement', {
          description: error instanceof Error ? error.message : String(error),
        })
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setAutoArranging(false)
      setProgressLabel(null)
    }
  }, [
    applyArrangement,
    arrangeMode,
    arrangePace,
    autoArranging,
    describeProgress,
    excludedShotIds,
    loopBars,
    preparingFootage,
    resolveRelativeMusic,
    transitionProfile,
    videoCandidates,
  ])

  const replaceArrangementShot = useCallback(
    async (segmentId: string, shotId: string) => {
      if (!lastPlan || !lastClipMap || loopBlocksGrouped) return
      try {
        const nextPlan = replaceSegmentSource(lastPlan, lastClipMap, segmentId, shotId)
        const result = await applyArrangement(nextPlan, lastClipMap)
        toast.success(
          lastPlan.mode === 'loop'
            ? 'Loop slot replaced in every repeat'
            : 'Arrangement shot replaced',
          {
            description: `Updated ${result.itemIds.length} generated clip${result.itemIds.length === 1 ? '' : 's'} in place.`,
          },
        )
      } catch (error) {
        toast.error('Could not replace this shot', {
          description: error instanceof Error ? error.message : String(error),
        })
      }
    },
    [applyArrangement, lastClipMap, lastPlan, loopBlocksGrouped],
  )

  const toggleAvoidShot = useCallback((shotId: string) => {
    setExcludedShotIds((current) =>
      current.includes(shotId)
        ? current.filter((candidate) => candidate !== shotId)
        : [...current, shotId],
    )
  }, [])

  const groupLoopRepeats = useCallback(() => {
    if (!lastPlan || lastPlan.mode !== 'loop' || loopBlocksGrouped) return
    const motif = lastPlan.motifs[0]
    if (!motif || motif.duration <= 0) return

    const groups = new Map<number, string[]>()
    for (const segment of lastPlan.segments) {
      if (segment.motifId !== motif.id) continue
      const itemId = lastItemIdBySegmentId[segment.id]
      if (!itemId) continue
      const repeatIndex = Math.max(
        0,
        Math.floor((segment.timelineStart - motif.start + 1e-6) / motif.duration),
      )
      const ids = groups.get(repeatIndex) ?? []
      ids.push(itemId)
      groups.set(repeatIndex, ids)
    }

    const wrappers = createLinkedPreCompPattern(
      'Loop A',
      [...groups.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, itemIds]) => itemIds),
    )
    if (wrappers.length === 0) return

    setGroupedLoopWrapperIds(wrappers.map((wrapper) => wrapper.id))
    setLoopBlocksGrouped(true)
    useSelectionStore.getState().selectItems(wrappers.map((wrapper) => wrapper.id))
    toast.success(
      `Loop A linked across ${wrappers.length} repeat${wrappers.length === 1 ? '' : 's'}`,
      {
        description: 'Double-click any Loop A block to edit the shared cuts.',
      },
    )
  }, [lastItemIdBySegmentId, lastPlan, loopBlocksGrouped])

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
          : `Video repeated across beat · ${result.itemIds.length} clips`,
      )
    } catch (error) {
      toast.error('Could not fill the beat with this clip', {
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
    <section className="space-y-3 border-b border-border bg-secondary/10 px-3 py-3">
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
          <div className="rounded-md border border-border bg-background/35 p-2.5">
            <div className="mb-2 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-semibold text-foreground">Arrangement</span>
            </div>

            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                aria-pressed={arrangeMode === 'auto'}
                onClick={() => setArrangeMode('auto')}
                className={`h-8 rounded border text-[10px] font-medium transition-colors ${
                  arrangeMode === 'auto'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                Auto cut
              </button>
              <button
                type="button"
                aria-pressed={arrangeMode === 'loop'}
                onClick={() => setArrangeMode('loop')}
                className={`h-8 rounded border text-[10px] font-medium transition-colors ${
                  arrangeMode === 'loop'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                Repeat motif
              </button>
            </div>

            <label className="mt-2 block space-y-1 text-[9px] text-muted-foreground">
              <span>Pace</span>
              <select
                value={arrangePace}
                onChange={(event) => setArrangePace(event.target.value as EditPace)}
                className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
              >
                <option value="relaxed">Relaxed</option>
                <option value="balanced">Balanced</option>
                <option value="energetic">Energetic</option>
              </select>
            </label>

            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <label className="space-y-1 text-[9px] text-muted-foreground">
                <span>Transitions</span>
                <select
                  value={transitionProfile}
                  onChange={(event) =>
                    setTransitionProfile(event.target.value as TransitionProfile)
                  }
                  className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
                >
                  <option value="clean">Clean cuts</option>
                  <option value="detroit">Detroit accents</option>
                </select>
              </label>

              {arrangeMode === 'loop' ? (
                <label className="space-y-1 text-[9px] text-muted-foreground">
                  <span>Loop bars</span>
                  <select
                    value={loopBars}
                    onChange={(event) => setLoopBars(Number(event.target.value))}
                    className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
                  >
                    <option value={2}>2 bars</option>
                    <option value={4}>4 bars</option>
                    <option value={8}>8 bars</option>
                    <option value={16}>16 bars</option>
                  </select>
                </label>
              ) : (
                <div />
              )}
            </div>

            <Button
              type="button"
              size="sm"
              className="mt-2 w-full justify-start"
              disabled={!timelineGrid || preparingFootage || autoArranging || loopBlocksGrouped}
              onClick={() => void autoArrangeFootage()}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {autoArranging
                ? 'Building arrangement…'
                : lastPlan
                  ? 'Rebuild arrangement'
                  : 'Build arrangement'}
            </Button>

            <p className="mt-1.5 text-[9px] leading-relaxed text-muted-foreground">
              Internal cuts use the same corrected beat points you see on the timeline.
              Section analysis can change pacing, never move a cut off the grid.
            </p>
          </div>

          {editableArrangementSlots.length > 0 ? (
            <details className="rounded-md border border-border bg-background/25 p-2">
              <summary className="cursor-pointer list-none text-[10px] font-medium text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                Used shots · {editableArrangementSlots.length}
              </summary>
              <div className="mt-2 space-y-2">
                {editableArrangementSlots.map(({ key, segment, shot, alternatives, linkedRepeats }) => (
                  <div key={key} className="rounded border border-border/70 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[9px] font-medium text-foreground">
                          {shot?.sourceName ?? 'Footage'}
                        </div>
                        <div className="font-mono text-[8px] text-muted-foreground">
                          {shot
                            ? `${shot.start.toFixed(2)}–${shot.end.toFixed(2)}s`
                            : segment.shotId}
                          {linkedRepeats > 1 ? ` · ×${linkedRepeats} repeats` : ''}
                        </div>
                      </div>
                      {shot ? (
                        <button
                          type="button"
                          onClick={() => toggleAvoidShot(shot.id)}
                          className={`rounded border px-1.5 py-1 text-[8px] ${
                            excludedShotIds.includes(shot.id)
                              ? 'border-amber-400/60 bg-amber-400/10 text-amber-200'
                              : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {excludedShotIds.includes(shot.id) ? 'Avoiding' : 'Avoid'}
                        </button>
                      ) : null}
                    </div>
                    <select
                      value={segment.shotId}
                      onChange={(event) =>
                        void replaceArrangementShot(segment.id, event.target.value)
                      }
                      className="mt-1.5 h-7 w-full rounded border border-input bg-secondary px-2 text-[9px] text-foreground"
                      aria-label="Replace arrangement shot"
                    >
                      {alternatives.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.sourceName} · {candidate.start.toFixed(1)}–{candidate.end.toFixed(1)}s
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <p className="text-[8px] leading-relaxed text-muted-foreground">
                  In Repeat motif mode, replacing one slot updates that slot in every repeat.
                  Avoided shots are skipped the next time you rebuild.
                </p>
              </div>
            </details>
          ) : null}

          {lastPlan?.mode === 'loop' && !loopBlocksGrouped ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full justify-start"
              onClick={groupLoopRepeats}
            >
              <Repeat2 className="h-3.5 w-3.5" />
              Link repeats as Loop A
            </Button>
          ) : null}

          {loopBlocksGrouped ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-[9px] leading-relaxed text-muted-foreground">
              Every block is an instance of Loop A. Double-click any block to edit the
              underlying cuts once; all repeats update together. Undo once to return to
              the generated cuts before linking.
            </div>
          ) : null}

          <details className="border-t border-border pt-2">
            <summary className="cursor-pointer list-none text-[10px] font-medium text-muted-foreground marker:hidden [&::-webkit-details-marker]:hidden">
              Fill with one clip
            </summary>
            <div className="mt-2 space-y-1.5">
              <select
                value={selectedLoopMediaId}
                onChange={(event) => setSelectedLoopMediaId(event.target.value)}
                className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
                aria-label="Clip used to fill beat"
              >
                {videoCandidates.map((media) => (
                  <option key={media.id} value={media.id}>
                    {media.fileName}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full justify-start"
                disabled={preparingFootage || autoArranging}
                onClick={() => void loopVideoToBeat()}
              >
                <Repeat2 className="h-3.5 w-3.5" />
                Fill beat with selected clip
              </Button>
            </div>
          </details>
        </>
      ) : null}

      {progressLabel ? (
        <div className="font-mono text-[9px] text-muted-foreground">{progressLabel}</div>
      ) : null}
      <p className="text-[9px] leading-relaxed text-muted-foreground">
        For a manual edit, drag any VIDEO card below straight onto the timeline.
      </p>
    </section>
  )
}
