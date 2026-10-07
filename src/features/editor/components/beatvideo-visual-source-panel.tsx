import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from 'react'
import { useEditorStore } from '@/shared/state/editor'
import { usePlaybackStore } from '@/shared/state/playback'
import { ChevronDown, ImagePlus, ScanSearch } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  applyEditPlanSourceChangesToTimeline,
  applyEditPlanToTimeline,
  buildClipMapForMedia,
  createEditPlan,
  createSingleClipLoopPlan,
  offsetEditPlanTimeline,
  replaceSegmentSource,
  reviewClipSourceShots,
  slipSegmentSource,
  type ReviewedShotEdit,
  type ClipMap,
  type ClipMapBuildProgress,
  type CutRhythm,
  type EditPace,
  type EditPlan,
  type SourceMixMode,
  type TransitionProfile,
} from '@/features/editor/deps/auto-edit-contract'
import { resolveBeatvideoTimelineGrid } from '@/features/editor/deps/beatvideo-music'
import { useMediaLibraryStore } from '@/features/editor/deps/media-library'
import { useProjectStore } from '@/features/editor/deps/projects'
import { useSceneBrowserStore } from '@/features/editor/deps/scene-browser'
import {
  createLinkedPreCompPattern,
  executeTimelineCommand,
  useItemsStore,
  useTimelineSettingsStore,
  useTimelineStore,
} from '@/features/editor/deps/timeline-store'
import { useSelectionStore } from '@/shared/state/selection'
import type { BeatvideoProjectMode } from '@/types/project'
import type { MusicMap } from '@/types/beatvideo'
import { BeatvideoShotBin, BeatvideoShotFrame } from './beatvideo-shot-bin'
import { BeatvideoShotReviewControls } from './beatvideo-shot-review-controls'
import { useSourcePlayerStore } from '@/shared/state/source-player'
import {
  ARRANGEMENT_SHOT_DRAG_MIME,
  decodeArrangementShotDragPayload,
  encodeArrangementShotDragPayload,
  shotFitsArrangementSlot,
} from './arrangement-shot-drag'

interface BeatvideoVisualSourcePanelProps {
  beatvideoMode: BeatvideoProjectMode
  importingPhotoCover: boolean
  onImportPhotoCover: () => void | Promise<void>
  onFitPhotoCoverToBeat: () => void
}

type ArrangeMode = 'auto' | 'loop'
type VisualStage = 'footage' | 'shots' | 'arrange' | 'sequence'

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
  const [visualStage, setVisualStage] = useState<VisualStage>('footage')

  const [arrangeMode, setArrangeMode] = useState<ArrangeMode>('auto')
  const [arrangePace, setArrangePace] = useState<EditPace>('balanced')
  const [cutRhythm, setCutRhythm] = useState<CutRhythm>('straight')
  const [sourceMixMode, setSourceMixMode] = useState<SourceMixMode>('balanced')
  const [sourceWeights, setSourceWeights] = useState<Record<string, number>>({})
  const [transitionProfile, setTransitionProfile] = useState<TransitionProfile>('clean')
  const [loopBars, setLoopBars] = useState(4)
  const [excludedShotIds, setExcludedShotIds] = useState<string[]>([])
  const [disabledArrangeSourceIds, setDisabledArrangeSourceIds] = useState<string[]>([])
  const [draggingShotId, setDraggingShotId] = useState<string | null>(null)
  const [selectedSourceShotId, setSelectedSourceShotId] = useState<string | null>(null)
  const sourcePlayerMediaId = useSourcePlayerStore((state) => state.currentMediaId)
  const sourceInPoint = useSourcePlayerStore((state) => state.inPoint)
  const sourceOutPoint = useSourcePlayerStore((state) => state.outPoint)
  const openSceneBrowser = useSceneBrowserStore((state) => state.openBrowser)
  const [reviewingShots, setReviewingShots] = useState(false)
  const [dragOverSlotKey, setDragOverSlotKey] = useState<string | null>(null)
  const [activeSourceSegmentId, setActiveSourceSegmentId] = useState<string | null>(null)

  const [lastClipMap, setLastClipMap] = useState<ClipMap | null>(null)
  const [lastPlan, setLastPlan] = useState<EditPlan | null>(null)
  const [lastAppliedItemIds, setLastAppliedItemIds] = useState<string[]>([])
  const [lastItemIdBySegmentId, setLastItemIdBySegmentId] = useState<Record<string, string>>({})
  const [lastTargetVideoTrackId, setLastTargetVideoTrackId] = useState<string | null>(null)
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
  const arrangeSourceIds = useMemo(
    () =>
      videoCandidates
        .map((media) => media.id)
        .filter((mediaId) => !disabledArrangeSourceIds.includes(mediaId)),
    [disabledArrangeSourceIds, videoCandidates],
  )

  useEffect(() => {
    const currentIds = new Set(videoCandidates.map((media) => media.id))
    setDisabledArrangeSourceIds((current) => {
      const next = current.filter((mediaId) => currentIds.has(mediaId))
      return next.length === current.length ? current : next
    })
  }, [videoCandidates])

  useEffect(() => {
    const currentIds = new Set(videoCandidates.map((media) => media.id))
    setSourceWeights((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([mediaId]) => currentIds.has(mediaId)),
      )
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })
  }, [videoCandidates])

  const setSourceWeight = useCallback((sourceId: string, value: number) => {
    const nextValue = Math.max(0.25, Math.min(2, Number.isFinite(value) ? value : 1))
    setSourceWeights((current) => ({ ...current, [sourceId]: nextValue }))
  }, [])

  const shotById = useMemo(
    () =>
      new Map(
        (lastClipMap?.sources ?? []).flatMap((source) =>
          source.shots.map((shot) => [shot.id, { ...shot, sourceName: source.name }] as const),
        ),
      ),
    [lastClipMap],
  )

  const selectedSourceShot = selectedSourceShotId ? shotById.get(selectedSourceShotId) : null
  const selectedShotMedia = selectedSourceShot
    ? videoCandidates.find((media) => media.id === selectedSourceShot.sourceId)
    : null
  const selectedShotFps = Math.max(1, selectedShotMedia?.fps || 30)
  const selectedShotSourceOpen = Boolean(
    selectedSourceShot &&
    sourcePlayerMediaId === selectedSourceShot.sourceId &&
    sourceInPoint !== null &&
    sourceOutPoint !== null,
  )
  const selectedShotRangeDirty = Boolean(
    selectedSourceShot &&
    selectedShotSourceOpen &&
    (sourceInPoint !== Math.round(selectedSourceShot.start * selectedShotFps) ||
      sourceOutPoint !== Math.round(selectedSourceShot.end * selectedShotFps)),
  )

  const editableArrangementSlots = useMemo(() => {
    if (!lastPlan || !lastClipMap || loopBlocksGrouped) return []
    const seen = new Set<string>()

    return lastPlan.segments.flatMap((segment) => {
      const key = segment.motifSlot ?? segment.id
      if (seen.has(key)) return []
      seen.add(key)
      const shot = shotById.get(segment.shotId)
      return [
        {
          key,
          segment,
          shot,
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
  }, [lastClipMap, lastPlan, loopBlocksGrouped, shotById])

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
  }, [groupedLoopWrapperIds, items, lastAppliedItemIds, loopBlocksGrouped])

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
      const allVideos = [
        ...videoCandidates,
        ...videos.filter(
          (video) => !videoCandidates.some((candidate) => candidate.id === video.id),
        ),
      ]
      const clipMap = await buildClipMapForMedia({
        media: allVideos,
        analyzeMissing: true,
        signal: controller.signal,
        onProgress: describeProgress,
      })
      setLastClipMap(clipMap)
      setSelectedSourceShotId(null)
      setVisualStage('shots')
      toast.success(videos.length === 1 ? 'Footage ready' : `${videos.length} footage clips ready`)
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
  }, [autoArranging, describeProgress, importingFootage, preparingFootage, videoCandidates])

  const prepareCurrentFootage = useCallback(async () => {
    if (preparingFootage || autoArranging || importingFootage) return
    if (videoCandidates.length === 0) {
      toast.warning('Add footage first')
      return
    }

    setPreparingFootage(true)
    setProgressLabel('Detecting shots…')
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const clipMap = await buildClipMapForMedia({
        media: videoCandidates,
        analyzeMissing: true,
        signal: controller.signal,
        onProgress: describeProgress,
      })
      setLastClipMap(clipMap)
      setSelectedSourceShotId(null)
      setVisualStage('shots')
      const validShotIds = new Set(
        clipMap.sources.flatMap((source) => source.shots.map((shot) => shot.id)),
      )
      setExcludedShotIds((current) => current.filter((shotId) => validShotIds.has(shotId)))
      const shotCount = clipMap.sources.reduce((total, source) => total + source.shots.length, 0)
      toast.success(`${shotCount} shot${shotCount === 1 ? '' : 's'} ready`)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error('Could not detect shots', {
          description: error instanceof Error ? error.message : String(error),
        })
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setPreparingFootage(false)
      setProgressLabel(null)
    }
  }, [autoArranging, describeProgress, importingFootage, preparingFootage, videoCandidates])

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
        .filter((beat) => beat.time >= timelineStart - 1e-6 && beat.time <= rangeEnd + 1e-6)
        .map((beat) => ({
          ...beat,
          time: Math.max(0, beat.time - timelineStart),
        })),
      sections: timelineGrid.grid.sections
        .filter((section) => section.end > timelineStart + 1e-6 && section.start < rangeEnd - 1e-6)
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
      const result = await applyEditPlanToTimeline(plan, {
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
      const plannerClipMap: ClipMap = {
        sources: clipMap.sources.filter((source) => arrangeSourceIds.includes(source.id)),
      }
      if (plannerClipMap.sources.length === 0) {
        toast.warning('Enable at least one footage source for this build')
        return
      }
      const relativePlan = createEditPlan(relative.music, plannerClipMap, {
        mode: arrangeMode,
        pace: arrangePace,
        cutRhythm,
        sourceMix: sourceMixMode,
        sourceWeights,
        loopBars,
        transitionProfile,
        excludedShotIds,
        seed: 1,
      })
      const plan = offsetEditPlanTimeline(relativePlan, relative.timelineStart)
      const result = await applyArrangement(plan, clipMap)
      setVisualStage('sequence')

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
    arrangeSourceIds,
    autoArranging,
    cutRhythm,
    describeProgress,
    excludedShotIds,
    loopBars,
    preparingFootage,
    resolveRelativeMusic,
    sourceMixMode,
    sourceWeights,
    transitionProfile,
    videoCandidates,
  ])

  const applyArrangementSourceRepair = useCallback(
    async (nextPlan: EditPlan) => {
      if (!lastPlan) return null
      const result = await applyEditPlanSourceChangesToTimeline(
        lastPlan,
        nextPlan,
        lastItemIdBySegmentId,
      )
      setLastPlan(nextPlan)
      return result
    },
    [lastItemIdBySegmentId, lastPlan],
  )

  const replaceArrangementShot = useCallback(
    async (segmentId: string, shotId: string) => {
      if (!lastPlan || !lastClipMap || loopBlocksGrouped) return
      try {
        const nextPlan = replaceSegmentSource(lastPlan, lastClipMap, segmentId, shotId)
        const result = await applyArrangementSourceRepair(nextPlan)
        if (!result) return
        setActiveSourceSegmentId(null)
        toast.success(
          lastPlan.mode === 'loop'
            ? 'Loop slot replaced in every repeat'
            : 'Arrangement shot replaced',
          {
            description: `Updated ${result.changedItemIds.length} source range${result.changedItemIds.length === 1 ? '' : 's'} without touching Motion or Effects.`,
          },
        )
      } catch (error) {
        toast.error('Could not replace this shot', {
          description: error instanceof Error ? error.message : String(error),
        })
      }
    },
    [applyArrangementSourceRepair, lastClipMap, lastPlan, loopBlocksGrouped],
  )

  const setGeneratedSlotEnabled = useCallback(
    (segment: EditPlan['segments'][number], enabled: boolean) => {
      if (!lastPlan || loopBlocksGrouped) return

      const targetSegments =
        segment.motifId && segment.motifSlot
          ? lastPlan.segments.filter(
              (candidate) =>
                candidate.motifId === segment.motifId && candidate.motifSlot === segment.motifSlot,
            )
          : [segment]
      const itemIds = targetSegments.flatMap((candidate) => {
        const itemId = lastItemIdBySegmentId[candidate.id]
        return itemId ? [itemId] : []
      })
      if (itemIds.length === 0) return

      executeTimelineCommand(
        'SET_BEATVIDEO_GENERATED_ENABLED',
        () => {
          const store = useItemsStore.getState()
          for (const itemId of itemIds) {
            store._updateItem(itemId, { enabled })
          }
          useTimelineSettingsStore.getState().markDirty()
        },
        { itemIds, enabled },
      )
    },
    [lastItemIdBySegmentId, lastPlan, loopBlocksGrouped],
  )

  const commitArrangementSourceStart = useCallback(
    async (segmentId: string, requestedSourceStart: number) => {
      if (!lastPlan || !lastClipMap || loopBlocksGrouped) return
      const segment = lastPlan.segments.find((candidate) => candidate.id === segmentId)
      if (!segment) return
      try {
        const delta = requestedSourceStart - segment.sourceStart
        if (Math.abs(delta) <= 1e-6) {
          setActiveSourceSegmentId(null)
          return
        }
        const nextPlan = slipSegmentSource(lastPlan, lastClipMap, segmentId, delta)
        const result = await applyArrangementSourceRepair(nextPlan)
        if (result) setActiveSourceSegmentId(null)
      } catch (error) {
        toast.error('Could not adjust this source range', {
          description: error instanceof Error ? error.message : String(error),
        })
      }
    },
    [applyArrangementSourceRepair, lastClipMap, lastPlan, loopBlocksGrouped],
  )

  const beginArrangementShotDrag = useCallback((event: DragEvent<HTMLElement>, shotId: string) => {
    setDraggingShotId(shotId)
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(ARRANGEMENT_SHOT_DRAG_MIME, encodeArrangementShotDragPayload(shotId))
    // Keep a plain-text fallback so the native drag remains valid in browsers
    // that suppress custom MIME reads until drop.
    event.dataTransfer.setData('text/plain', shotId)
  }, [])

  const endArrangementShotDrag = useCallback(() => {
    setDraggingShotId(null)
    setDragOverSlotKey(null)
  }, [])

  const canDropArrangementShot = useCallback(
    (shotId: string | null, segment: EditPlan['segments'][number]) => {
      if (!shotId) return false
      const shot = shotById.get(shotId)
      if (!shot) return false
      return shotFitsArrangementSlot({
        shotStart: shot.start,
        shotEnd: shot.end,
        slotDuration: segmentDuration(segment),
      })
    },
    [shotById],
  )

  const handleArrangementSlotDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, slotKey: string, segment: EditPlan['segments'][number]) => {
      if (!canDropArrangementShot(draggingShotId, segment)) {
        event.dataTransfer.dropEffect = 'none'
        setDragOverSlotKey(null)
        return
      }
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      setDragOverSlotKey(slotKey)
    },
    [canDropArrangementShot, draggingShotId],
  )

  const handleArrangementSlotDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, segment: EditPlan['segments'][number]) => {
      event.preventDefault()
      const payload = decodeArrangementShotDragPayload(
        event.dataTransfer.getData(ARRANGEMENT_SHOT_DRAG_MIME),
      )
      const shotId = payload?.shotId ?? draggingShotId
      setDraggingShotId(null)
      setDragOverSlotKey(null)

      if (!shotId) return
      const shot = shotById.get(shotId)
      if (!shot) return

      if (
        !shotFitsArrangementSlot({
          shotStart: shot.start,
          shotEnd: shot.end,
          slotDuration: segmentDuration(segment),
        })
      ) {
        toast.warning('Shot is too short for this slot')
        return
      }
      if (shotId === segment.shotId) return
      void replaceArrangementShot(segment.id, shotId)
    },
    [draggingShotId, replaceArrangementShot, shotById],
  )

  const toggleAvoidShot = useCallback((shotId: string) => {
    setExcludedShotIds((current) =>
      current.includes(shotId)
        ? current.filter((candidate) => candidate !== shotId)
        : [...current, shotId],
    )
  }, [])

  const openAiSceneSearch = useCallback(() => {
    openSceneBrowser({
      mediaId: selectedSourceShot?.sourceId ?? null,
      focus: true,
    })
  }, [openSceneBrowser, selectedSourceShot?.sourceId])

  const setArrangeSourceEnabled = useCallback((sourceId: string, enabled: boolean) => {
    setDisabledArrangeSourceIds((current) =>
      enabled
        ? current.filter((candidate) => candidate !== sourceId)
        : current.includes(sourceId)
          ? current
          : [...current, sourceId],
    )
  }, [])

  const previewArrangementShotAtPointer = useCallback(
    (event: PointerEvent<HTMLElement>, shot: { sourceId: string; start: number; end: number }) => {
      if (draggingShotId) return
      const media = mediaItems.find((candidate) => candidate.id === shot.sourceId)
      if (!media || media.fps <= 0) return

      const rect = event.currentTarget.getBoundingClientRect()
      if (rect.width <= 0) return
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
      const sourceTime = shot.start + (shot.end - shot.start) * ratio
      const sourceFrame = Math.max(0, Math.round(sourceTime * media.fps))

      const playback = usePlaybackStore.getState()
      if (playback.isPlaying) playback.pause()
      playback.setPreviewFrame(null)
      useEditorStore.getState().setMediaSkimPreview(shot.sourceId, sourceFrame)
    },
    [draggingShotId, mediaItems],
  )

  const clearArrangementShotPreview = useCallback(() => {
    useEditorStore.getState().setMediaSkimPreview(null)
  }, [])

  const openShotInSourceMonitor = useCallback(
    (shot: { sourceId: string; start: number; end: number }) => {
      const source = mediaItems.find((item) => item.id === shot.sourceId)
      if (!source) return
      const fps = Math.max(1, source.fps || 30)
      const startFrame = Math.max(0, Math.round(shot.start * fps))
      const endFrame = Math.max(startFrame + 1, Math.round(shot.end * fps))

      const program = usePlaybackStore.getState()
      if (program.isPlaying) program.pause()
      clearArrangementShotPreview()

      // Source monitor already provides real video playback, frame seeking and
      // draggable In/Out handles. Reuse it instead of a second shot player.
      const sourcePlayer = useSourcePlayerStore.getState()
      sourcePlayer.setCurrentMediaId(shot.sourceId)
      sourcePlayer.setInPoint(startFrame)
      sourcePlayer.setOutPoint(endFrame)
      // Reviewing a shot is inspection, not an implicit Play action.
      sourcePlayer.setPendingPlay(false)
      sourcePlayer.setPendingSeekFrame(startFrame)
      useEditorStore.getState().setSourcePreviewMediaId(shot.sourceId)
    },
    [clearArrangementShotPreview, mediaItems],
  )

  const handleReviewSourceShot = useCallback(
    async (action: ReviewedShotEdit) => {
      if (preparingFootage || autoArranging || reviewingShots) return
      const shot = action.kind === 'reset-scenes' ? selectedSourceShot : shotById.get(action.shotId)
      if (!shot) return
      const source = videoCandidates.find((candidate) => candidate.id === shot.sourceId)
      if (!source) return
      setReviewingShots(true)
      try {
        const nextSource = await reviewClipSourceShots(source, action)
        setLastClipMap(
          (current) =>
            current && {
              ...current,
              sources: current.sources.map((candidate) =>
                candidate.id === source.id ? nextSource : candidate,
              ),
            },
        )
        const nextSelectedShotId =
          action.kind === 'merge-left'
            ? `${source.id}:shot:${Math.max(1, Number(action.shotId.split(':').at(-1)) - 1)}`
            : action.kind === 'reset-scenes'
              ? null
              : shot.id
        if (action.kind === 'merge-left' || action.kind === 'reset-scenes') {
          setSelectedSourceShotId(nextSelectedShotId)
        }

        // Review persistence is the owner of saved source boundaries. Refresh
        // the active Source monitor after Save, Reset, Split or Merge so an old
        // draft never masquerades as a newly saved result.
        const player = useSourcePlayerStore.getState()
        if (player.currentMediaId === source.id) {
          const savedShot = nextSource.shots.find(
            (candidate) => candidate.id === nextSelectedShotId,
          )
          if (savedShot) {
            const sourceFps = Math.max(1, source.fps || 30)
            const firstFrame = Math.max(0, Math.round(savedShot.start * sourceFps))
            const afterLastFrame = Math.max(firstFrame + 1, Math.round(savedShot.end * sourceFps))
            player.setInPoint(firstFrame)
            player.setOutPoint(afterLastFrame)
            player.setPendingSeekFrame(firstFrame)
          } else if (action.kind === 'reset-scenes') {
            player.clearInOutPoints()
          }
        }
        toast.success('Source shots updated')
      } catch (error) {
        toast.error('Could not save shot correction', {
          description: error instanceof Error ? error.message : String(error),
        })
      } finally {
        setReviewingShots(false)
      }
    },
    [
      autoArranging,
      preparingFootage,
      reviewingShots,
      selectedSourceShot,
      shotById,
      videoCandidates,
    ],
  )

  const saveSelectedShotInOut = useCallback(() => {
    if (!selectedSourceShot) return
    const source = videoCandidates.find((media) => media.id === selectedSourceShot.sourceId)
    const player = useSourcePlayerStore.getState()
    if (
      !source ||
      player.currentMediaId !== source.id ||
      player.inPoint === null ||
      player.outPoint === null
    ) {
      toast.warning('Open the shot and set In/Out in the Source player first.')
      return
    }
    const sourceFps = Math.max(1, source.fps || 30)
    void handleReviewSourceShot({
      kind: 'trim',
      shotId: selectedSourceShot.id,
      start: player.inPoint / sourceFps,
      end: player.outPoint / sourceFps,
    })
  }, [handleReviewSourceShot, selectedSourceShot, videoCandidates])

  const cancelSelectedShotInOut = useCallback(() => {
    if (!selectedSourceShot) return
    const source = videoCandidates.find((media) => media.id === selectedSourceShot.sourceId)
    const player = useSourcePlayerStore.getState()
    if (!source || player.currentMediaId !== source.id) return
    const sourceFps = Math.max(1, source.fps || 30)
    const originalStartFrame = Math.max(0, Math.round(selectedSourceShot.start * sourceFps))
    const originalEndFrame = Math.max(
      originalStartFrame + 1,
      Math.round(selectedSourceShot.end * sourceFps),
    )
    player.setInPoint(originalStartFrame)
    player.setOutPoint(originalEndFrame)
    player.setPreviewSourceFrame(null)
    player.setPendingSeekFrame(originalStartFrame)
  }, [selectedSourceShot, videoCandidates])

  const splitSelectedShotAtPlayhead = useCallback(() => {
    if (!selectedSourceShot) return
    const source = videoCandidates.find((media) => media.id === selectedSourceShot.sourceId)
    const player = useSourcePlayerStore.getState()
    if (!source || player.currentMediaId !== source.id) {
      toast.warning('Open the shot in Source before splitting.')
      return
    }
    void handleReviewSourceShot({
      kind: 'split',
      shotId: selectedSourceShot.id,
      time: player.currentSourceFrame / Math.max(1, source.fps || 30),
    })
  }, [handleReviewSourceShot, selectedSourceShot, videoCandidates])

  // Reuse the canonical source monitor for precise video In/Out editing.
  // Musical timeline boundaries stay fixed when applying the source slip.
  const beginVisualSourceTrim = useCallback(
    (segment: EditPlan['segments'][number]) => {
      openShotInSourceMonitor({
        sourceId: segment.sourceId,
        start: segment.sourceStart,
        end: segment.sourceEnd,
      })
      setActiveSourceSegmentId(segment.id)
    },
    [openShotInSourceMonitor],
  )

  const applyVisualSourceTrim = useCallback(
    (segment: EditPlan['segments'][number]) => {
      const source = mediaItems.find((media) => media.id === segment.sourceId)
      const shot = shotById.get(segment.shotId)
      const state = useSourcePlayerStore.getState()
      if (
        !source ||
        !shot ||
        state.currentMediaId !== segment.sourceId ||
        state.inPoint === null ||
        state.outPoint === null
      ) {
        toast.warning('Select a valid source range before applying')
        return
      }
      const sourceFps = Math.max(1, source.fps || 30)
      const inSeconds = state.inPoint / sourceFps
      const outSeconds = state.outPoint / sourceFps
      const slotLength = segmentDuration(segment)
      if (outSeconds - inSeconds < slotLength - 1 / sourceFps) {
        toast.warning('The selected source range is shorter than this musical clip')
        return
      }
      if (
        inSeconds < shot.start - 1 / sourceFps ||
        inSeconds + slotLength > shot.end + 1 / sourceFps
      ) {
        toast.warning('Keep the source selection inside the detected shot')
        return
      }
      void commitArrangementSourceStart(segment.id, inSeconds)
    },
    [commitArrangementSourceStart, mediaItems, shotById],
  )

  const focusArrangementSegment = useCallback(
    (segment: EditPlan['segments'][number]) => {
      const itemId = lastItemIdBySegmentId[segment.id]
      if (!itemId) return
      const item = useItemsStore.getState().items.find((candidate) => candidate.id === itemId)
      if (!item) return

      const selection = useSelectionStore.getState()
      selection.setActiveTrack(item.trackId)
      selection.selectItems([itemId])

      const playback = usePlaybackStore.getState()
      playback.pause()
      playback.setPreviewFrame(null)
      playback.setCurrentFrame(Math.max(0, Math.round(segment.timelineStart * fps)))
    },
    [fps, lastItemIdBySegmentId],
  )

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
      [...groups.entries()].sort(([left], [right]) => left - right).map(([, itemIds]) => itemIds),
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

  const openGeneratedInspector = useCallback(
    (tab: 'motion' | 'effects') => {
      const timeline = useItemsStore.getState()
      const existingIds = new Set(timeline.items.map((item) => item.id))
      const generatedIds = lastAppliedItemIds.filter((itemId) => existingIds.has(itemId))
      if (generatedIds.length === 0) {
        toast.info('Build the sequence first')
        return
      }

      const first = timeline.items.find((item) => item.id === generatedIds[0])
      const selection = useSelectionStore.getState()
      if (first) selection.setActiveTrack(first.trackId)
      selection.selectItems(generatedIds)

      const editor = useEditorStore.getState()
      editor.setRightSidebarOpen(true)
      editor.setClipInspectorTab(tab)
    },
    [lastAppliedItemIds],
  )

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
      const result = await applyEditPlanToTimeline(
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

  // One review control set in Shots and Sequence. The draft is kept only in
  // the existing source player; persisted edits belong to reviewClipSourceShots.
  const shotReviewControls =
    lastClipMap && selectedSourceShot ? (
      <BeatvideoShotReviewControls
        name={selectedSourceShot.sourceName}
        id={selectedSourceShot.id}
        busy={reviewingShots}
        dirty={selectedShotRangeDirty}
        sourceOpen={selectedShotSourceOpen}
        onSave={saveSelectedShotInOut}
        onCancel={cancelSelectedShotInOut}
        onSplit={splitSelectedShotAtPlayhead}
        onMergeLeft={() =>
          void handleReviewSourceShot({
            kind: 'merge-left',
            shotId: selectedSourceShot.id,
          })
        }
        onResetTrim={() =>
          void handleReviewSourceShot({
            kind: 'reset-trim',
            shotId: selectedSourceShot.id,
          })
        }
        onResetAll={() => void handleReviewSourceShot({ kind: 'reset-scenes' })}
      />
    ) : null

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
    <section className="max-h-[62vh] shrink-0 space-y-4 overflow-y-auto border-b border-border px-5 py-4">
      {/* The editor has one main tool navigation above. Stage changes here
          are a compact local selector, not another competing tab strip. */}
      <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Video workflow
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {visualStage === 'footage'
              ? 'Choose footage'
              : visualStage === 'shots'
                ? 'Review source shots'
                : visualStage === 'arrange'
                  ? 'Build on the beat'
                  : 'Fine-tune the edit'}
          </p>
        </div>
        <label className="relative min-w-[126px] max-w-[165px] flex-1">
          <span className="sr-only">Video workflow stage</span>
          <select
            value={visualStage}
            aria-label="Video workflow stage"
            onChange={(event) => setVisualStage(event.currentTarget.value as VisualStage)}
            className="h-8 w-full appearance-none border border-border bg-secondary pl-3 pr-7 text-xs font-medium text-foreground hover:border-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            <option value="footage">1 · Footage</option>
            <option value="shots" disabled={videoCandidates.length === 0}>
              2 · Shots
            </option>
            <option value="arrange" disabled={!lastClipMap || !timelineGrid}>
              3 · Arrange
            </option>
            <option
              value="sequence"
              disabled={lastAppliedItemIds.length === 0 && !loopBlocksGrouped}
            >
              4 · Sequence
            </option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        </label>
      </div>

      {visualStage === 'footage' ? (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold text-foreground">Footage</div>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                {videoCandidates.length === 0
                  ? 'No video added'
                  : `${videoCandidates.length} source${videoCandidates.length === 1 ? '' : 's'}`}
              </div>
            </div>
            <button
              type="button"
              className="studio-primary-action h-8 px-3"
              disabled={importingFootage || preparingFootage || autoArranging}
              onClick={() => void importFootage()}
            >
              {importingFootage ? 'Adding…' : '+ Add footage'}
            </button>
          </div>

          {videoCandidates.length > 0 ? (
            <div className="space-y-1.5">
              {videoCandidates.map((media) => {
                const enabled = arrangeSourceIds.includes(media.id)
                return (
                  <div
                    key={media.id}
                    className="flex min-h-10 items-center gap-2 rounded-[3px] bg-secondary px-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[10px] font-semibold text-foreground">
                        {media.fileName}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {Math.max(0, media.duration).toFixed(1)} s
                      </div>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {enabled ? 'ON' : 'OFF'}
                    </span>
                    <Switch
                      checked={enabled}
                      onCheckedChange={(checked) => setArrangeSourceEnabled(media.id, checked)}
                      className="h-4 w-7 border border-border data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
                      aria-label={`${enabled ? 'Exclude' : 'Include'} ${media.fileName} from build`}
                    />
                  </div>
                )
              })}
              <button
                type="button"
                className="studio-primary-action mt-2 h-9 w-full"
                onClick={() => setVisualStage('shots')}
              >
                Continue to Shots
              </button>
            </div>
          ) : (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Add the source videos you want to cut. Scene analysis stays attached to each source.
            </p>
          )}
        </div>
      ) : null}

      {videoCandidates.length > 0 && visualStage === 'shots' ? (
        <div className="space-y-3">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-medium text-foreground">Shots</div>
              <div className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                Review detected cut boundaries. AI search finds source moments; it never replaces
                those boundaries.
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 gap-1.5 px-2.5 text-xs"
                onClick={openAiSceneSearch}
                aria-label="Search source scenes with AI"
                title="Search captions, meaning and color. Search timestamps never replace shot boundaries."
              >
                <ScanSearch className="h-3.5 w-3.5" />
                AI search
              </Button>
              <Button
                type="button"
                size="sm"
                variant={lastClipMap ? 'outline' : 'default'}
                className="h-9 min-w-[92px] shrink-0 px-3 text-xs"
                disabled={preparingFootage || autoArranging || importingFootage}
                onClick={() => void prepareCurrentFootage()}
              >
                {preparingFootage
                  ? 'Detecting shots…'
                  : lastClipMap
                    ? 'Redetect shots'
                    : 'Detect shots'}
              </Button>
            </div>
          </div>
          {lastClipMap ? (
            <BeatvideoShotBin
              clipMap={lastClipMap}
              excludedShotIds={excludedShotIds}
              draggingShotId={draggingShotId}
              selectedShotId={selectedSourceShotId}
              onToggleAvoid={toggleAvoidShot}
              onOpenShot={(shot) => {
                setActiveSourceSegmentId(null)
                setSelectedSourceShotId(shot.id)
                openShotInSourceMonitor(shot)
              }}
              onDragStart={beginArrangementShotDrag}
              onDragEnd={endArrangementShotDrag}
            />
          ) : (
            <div className="rounded-[3px] bg-background p-3 text-[10px] text-muted-foreground">
              Detect shots to inspect the automatic split before building an edit.
            </div>
          )}
          {shotReviewControls}
          {lastClipMap ? (
            <button
              type="button"
              className="studio-primary-action h-9 w-full"
              disabled={!timelineGrid}
              onClick={() => setVisualStage('arrange')}
            >
              {timelineGrid ? 'Continue to Arrange' : 'Analyze the beat first'}
            </button>
          ) : null}
        </div>
      ) : null}

      {videoCandidates.length > 0 ? (
        <>
          <div className={visualStage === 'arrange' ? 'space-y-3' : 'hidden'}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-foreground">Place on beat</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {timelineGrid ? 'Grid ready' : 'Needs beat grid'}
              </span>
            </div>

            <div className="studio-segmented grid h-8 grid-cols-2">
              <button
                type="button"
                aria-pressed={arrangeMode === 'auto'}
                onClick={() => setArrangeMode('auto')}
                className="studio-segment h-7 text-[10px] font-medium"
              >
                Auto arrange
              </button>
              <button
                type="button"
                aria-pressed={arrangeMode === 'loop'}
                onClick={() => setArrangeMode('loop')}
                className="studio-segment h-7 text-[10px] font-medium"
              >
                Repeat motif
              </button>
            </div>

            <div className="mt-2 border-y border-border/70 py-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium text-foreground">
                  Sources for this build
                </span>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {arrangeSourceIds.length}/{videoCandidates.length} on
                </span>
              </div>
              <div className="max-h-28 space-y-0.5 overflow-y-auto">
                {videoCandidates.map((media) => {
                  const enabled = arrangeSourceIds.includes(media.id)
                  return (
                    <label
                      key={media.id}
                      className="flex h-7 min-w-0 items-center gap-2 px-1 text-[10px] text-foreground hover:bg-secondary/35"
                    >
                      <Switch
                        checked={enabled}
                        onCheckedChange={(checked) => setArrangeSourceEnabled(media.id, checked)}
                        className="h-4 w-7 border border-border data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
                        aria-label={`${enabled ? 'Exclude' : 'Include'} ${media.fileName} from build`}
                      />
                      <span className="min-w-0 flex-1 truncate">{media.fileName}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="mt-2 space-y-2">
              <div>
                <div className="mb-1 text-[10px] text-muted-foreground">Source mix</div>
                <div className="studio-segmented grid h-8 grid-cols-3">
                  {(
                    [
                      ['balanced', 'Balanced'],
                      ['rotate', 'Rotate'],
                      ['weighted', 'Weighted'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={sourceMixMode === value}
                      onClick={() => setSourceMixMode(value as SourceMixMode)}
                      className="studio-segment h-7 px-1 text-[10px] font-medium"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {sourceMixMode === 'weighted' ? (
                <div className="space-y-1 border-y border-border/60 py-1.5">
                  {videoCandidates
                    .filter((media) => arrangeSourceIds.includes(media.id))
                    .map((media) => {
                      const weight = sourceWeights[media.id] ?? 1
                      return (
                        <label
                          key={media.id}
                          className="grid grid-cols-[minmax(0,1fr)_72px_30px] items-center gap-2 px-1 text-[10px]"
                        >
                          <span className="truncate text-muted-foreground">{media.fileName}</span>
                          <input
                            type="range"
                            min={0.25}
                            max={2}
                            step={0.25}
                            value={weight}
                            onChange={(event) =>
                              setSourceWeight(media.id, Number(event.currentTarget.value))
                            }
                            className="h-3 w-full accent-primary"
                            aria-label={`Weight for ${media.fileName}`}
                          />
                          <span className="text-right font-mono tabular-nums text-foreground">
                            {weight.toFixed(2)}×
                          </span>
                        </label>
                      )
                    })}
                </div>
              ) : null}

              <div>
                <div className="mb-1 text-[10px] text-muted-foreground">Pace</div>
                <div className="studio-segmented grid h-8 grid-cols-3">
                  {(
                    [
                      ['relaxed', 'Relaxed'],
                      ['balanced', 'Balanced'],
                      ['energetic', 'Energetic'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={arrangePace === value}
                      onClick={() => setArrangePace(value as EditPace)}
                      className="studio-segment h-7 px-1 text-[10px] font-medium"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span>Cut rhythm</span>
                  <span className="font-mono">
                    {cutRhythm === 'straight'
                      ? 'beats'
                      : cutRhythm === 'backbeat'
                        ? '2 + 4'
                        : 'beats + &'}
                  </span>
                </div>
                <div className="studio-segmented grid h-8 grid-cols-3">
                  {(
                    [
                      ['straight', 'Straight'],
                      ['backbeat', 'Backbeat'],
                      ['syncopated', 'Syncopated'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={cutRhythm === value}
                      onClick={() => setCutRhythm(value)}
                      className="studio-segment h-7 px-1 text-[10px] font-medium"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  {cutRhythm === 'straight'
                    ? 'Every internal cut stays on a detected beat.'
                    : cutRhythm === 'backbeat'
                      ? 'Still beat-locked, but some cuts favor beats 2 and 4 — common backbeat/snare positions.'
                      : 'Adds occasional half-beat “and” cuts for syncopation; every edge still belongs to the musical grid.'}
                </p>
              </div>

              <div>
                <div className="mb-1 text-[10px] text-muted-foreground">Transitions</div>
                <div className="studio-segmented grid h-8 grid-cols-2">
                  {(
                    [
                      ['clean', 'Cuts only'],
                      ['accent', 'Accent'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={transitionProfile === value}
                      onClick={() => setTransitionProfile(value as TransitionProfile)}
                      className="studio-segment h-7 px-1 text-[10px] font-medium"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {arrangeMode === 'loop' ? (
              <div className="mt-2">
                <div className="mb-1 text-[10px] text-muted-foreground">Loop length</div>
                <div className="studio-segmented grid h-8 grid-cols-4">
                  {[2, 4, 8, 16].map((bars) => (
                    <button
                      key={bars}
                      type="button"
                      aria-pressed={loopBars === bars}
                      onClick={() => setLoopBars(bars)}
                      className="studio-segment h-7 px-1 text-[10px] font-medium"
                    >
                      {bars} bars
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => useEditorStore.getState().setActiveTab('transitions')}
              className="mt-2 text-left text-[10px] text-muted-foreground hover:text-foreground"
            >
              Edit transitions manually
            </button>

            <Button
              type="button"
              size="sm"
              className="mt-2 w-full justify-center"
              disabled={
                !timelineGrid ||
                arrangeSourceIds.length === 0 ||
                preparingFootage ||
                autoArranging ||
                loopBlocksGrouped
              }
              onClick={() => void autoArrangeFootage()}
            >
              {autoArranging ? 'Building…' : lastPlan ? 'Rebuild sequence' : 'Build sequence'}
            </Button>

            {lastAppliedItemIds.length > 0 && !loopBlocksGrouped ? (
              <div className="mt-2 flex items-center gap-3 border-t border-border/70 pt-2 text-[10px]">
                <span className="text-muted-foreground">Generated clips</span>
                <button
                  type="button"
                  className="text-foreground hover:text-primary"
                  onClick={() => openGeneratedInspector('motion')}
                >
                  Motion for all
                </button>
                <button
                  type="button"
                  className="text-foreground hover:text-primary"
                  onClick={() => openGeneratedInspector('effects')}
                >
                  Effects for all
                </button>
              </div>
            ) : null}
            <div className="mt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
              Cuts: corrected beat grid · source audio: muted
            </div>
          </div>

          {visualStage === 'sequence' && !loopBlocksGrouped && lastClipMap ? (
            <div className="border-t border-border pt-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium text-foreground">Source shots</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    Preview · drag to replace
                  </span>
                  <button
                    type="button"
                    className="studio-secondary-action h-7 px-2"
                    onClick={openAiSceneSearch}
                    aria-label="Search source scenes with AI"
                  >
                    AI search
                  </button>
                </div>
              </div>
              <BeatvideoShotBin
                clipMap={lastClipMap}
                excludedShotIds={excludedShotIds}
                draggingShotId={draggingShotId}
                selectedShotId={selectedSourceShotId}
                onToggleAvoid={toggleAvoidShot}
                onOpenShot={(shot) => {
                  setActiveSourceSegmentId(null)
                  setSelectedSourceShotId(shot.id)
                  openShotInSourceMonitor(shot)
                }}
                onDragStart={beginArrangementShotDrag}
                onDragEnd={endArrangementShotDrag}
              />
              {shotReviewControls}
            </div>
          ) : null}

          {visualStage === 'sequence' && editableArrangementSlots.length > 0 && lastClipMap ? (
            <div className="border-t border-border pt-2">
              <div className="mb-1.5 flex items-end justify-between gap-2">
                <div>
                  <div className="text-[10px] font-medium text-foreground">Sequence</div>
                  <div className="text-[10px] text-muted-foreground">
                    Drag a source shot above to replace · select a clip to edit on the timeline
                  </div>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {editableArrangementSlots.length} slots
                </span>
              </div>

              <div className="flex gap-1 overflow-x-auto pb-1" data-beatvideo-arrangement-strip>
                {editableArrangementSlots.map(({ key, segment, shot, linkedRepeats }, index) => {
                  const duration = segmentDuration(segment)
                  const isDragTarget = dragOverSlotKey === key
                  const currentShotIsManual = segment.manualOverride === true
                  const sourceDuration = shot
                    ? (lastClipMap.sources.find((source) => source.id === shot.sourceId)
                        ?.duration ?? shot.end)
                    : duration
                  const slotItemIds =
                    segment.motifId && segment.motifSlot && lastPlan
                      ? lastPlan.segments
                          .filter(
                            (candidate) =>
                              candidate.motifId === segment.motifId &&
                              candidate.motifSlot === segment.motifSlot,
                          )
                          .flatMap((candidate) => {
                            const itemId = lastItemIdBySegmentId[candidate.id]
                            return itemId ? [itemId] : []
                          })
                      : [lastItemIdBySegmentId[segment.id]].filter((itemId): itemId is string =>
                          Boolean(itemId),
                        )
                  const slotEnabled =
                    slotItemIds.length === 0 ||
                    slotItemIds.every(
                      (itemId) => items.find((item) => item.id === itemId)?.enabled !== false,
                    )

                  return (
                    <div
                      key={key}
                      onDragOver={(event) => handleArrangementSlotDragOver(event, key, segment)}
                      onDragLeave={(event) => {
                        const nextTarget = event.relatedTarget
                        if (
                          !nextTarget ||
                          !(nextTarget instanceof Node) ||
                          !event.currentTarget.contains(nextTarget)
                        ) {
                          setDragOverSlotKey((current) => (current === key ? null : current))
                        }
                      }}
                      onDrop={(event) => {
                        clearArrangementShotPreview()
                        handleArrangementSlotDrop(event, segment)
                      }}
                      className={`w-36 shrink-0 border bg-background outline-none transition-colors ${
                        isDragTarget
                          ? 'border-primary ring-1 ring-primary/40'
                          : currentShotIsManual
                            ? 'border-primary/45'
                            : 'border-border/80'
                      }`}
                    >
                      <button
                        type="button"
                        className={`block w-full text-left outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary ${
                          slotEnabled ? '' : 'opacity-45'
                        }`}
                        onPointerEnter={(event) => {
                          if (shot) previewArrangementShotAtPointer(event, shot)
                        }}
                        onPointerMove={(event) => {
                          if (shot) previewArrangementShotAtPointer(event, shot)
                        }}
                        onPointerLeave={clearArrangementShotPreview}
                        onClick={() => {
                          clearArrangementShotPreview()
                          focusArrangementSegment(segment)
                        }}
                        aria-label={`Select generated clip ${index + 1}`}
                      >
                        <div className="relative aspect-video w-full overflow-hidden">
                          {shot ? (
                            <BeatvideoShotFrame
                              shot={shot}
                              sourceDuration={sourceDuration}
                              className="h-full w-full"
                            />
                          ) : (
                            <div className="h-full w-full bg-muted/40" />
                          )}
                          <span className="absolute left-1 top-1 bg-background/85 px-1 font-mono text-[10px] text-foreground/80">
                            {index + 1}
                          </span>
                          <span className="absolute bottom-1 right-1 bg-background/85 px-1 font-mono text-[10px] text-foreground/80">
                            {duration.toFixed(2)}s{linkedRepeats > 1 ? ` ×${linkedRepeats}` : ''}
                          </span>
                        </div>

                        <div className="truncate border-t border-border/70 px-1.5 py-1 text-[10px] text-foreground/80">
                          {shot?.sourceName ?? 'Footage'}
                          {currentShotIsManual ? ' · edited' : ''}
                        </div>
                      </button>

                      <div className="flex h-7 items-center justify-between gap-2 border-t border-border/70 px-1.5">
                        <span className="text-[10px] text-muted-foreground">
                          {linkedRepeats > 1 ? `All ${linkedRepeats} repeats` : 'Clip'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {slotEnabled ? 'ON' : 'OFF'}
                          </span>
                          <Switch
                            checked={slotEnabled}
                            onCheckedChange={(checked) => setGeneratedSlotEnabled(segment, checked)}
                            className="h-4 w-7 border border-border data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
                            aria-label={`${slotEnabled ? 'Disable' : 'Enable'} generated clip ${index + 1}`}
                          />
                        </div>
                      </div>

                      {shot ? (
                        <div className="border-t border-border/70 px-1.5 py-1.5">
                          {activeSourceSegmentId === segment.id ? (
                            <div className="space-y-1.5">
                              <p className="text-[10px] leading-snug text-muted-foreground">
                                Slip the source range in Source. Duration stays{' '}
                                {duration.toFixed(2)}s; timeline clip edges and musical cuts remain
                                fixed.
                              </p>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  className="studio-primary-action h-7 min-w-0 flex-1 px-1 text-[10px]"
                                  onClick={() => applyVisualSourceTrim(segment)}
                                >
                                  Apply slip
                                </button>
                                <button
                                  type="button"
                                  className="studio-secondary-action h-7 px-1 text-[10px]"
                                  onClick={() => setActiveSourceSegmentId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="studio-secondary-action h-7 w-full px-1 text-[10px]"
                              aria-label={`Edit source range for generated clip ${index + 1}`}
                              onClick={() => beginVisualSourceTrim(segment)}
                            >
                              Slip source
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {visualStage === 'sequence' && lastPlan?.mode === 'loop' && !loopBlocksGrouped ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full justify-start"
              onClick={groupLoopRepeats}
            >
              Link repeats as Loop A
            </Button>
          ) : null}

          {visualStage === 'sequence' && loopBlocksGrouped ? (
            <div className="border-l border-primary/50 pl-2 text-[10px] leading-relaxed text-muted-foreground">
              Every block is an instance of Loop A. Double-click any block to edit the underlying
              cuts once; all repeats update together. Undo once to return to the generated cuts
              before linking.
            </div>
          ) : null}

          <details className={visualStage === 'arrange' ? 'border-t border-border pt-2' : 'hidden'}>
            <summary className="cursor-pointer list-none text-[10px] font-medium text-muted-foreground marker:hidden [&::-webkit-details-marker]:hidden">
              Single-clip fill
            </summary>
            <div className="mt-2 space-y-1.5">
              <select
                value={selectedLoopMediaId}
                onChange={(event) => setSelectedLoopMediaId(event.target.value)}
                className="h-8 w-full rounded-sm border border-input bg-secondary px-2 text-xs text-foreground"
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
                Fill beat with selected clip
              </Button>
            </div>
          </details>
        </>
      ) : null}

      {progressLabel ? (
        <div className="font-mono text-[10px] text-muted-foreground">{progressLabel}</div>
      ) : null}
      {visualStage === 'footage' ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Manual placement stays available: drag any source from the Media library onto the Media
          lane.
        </p>
      ) : null}
    </section>
  )
}
