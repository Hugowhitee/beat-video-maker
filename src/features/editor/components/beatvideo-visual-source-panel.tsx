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
import { ImagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  applyEditPlanSourceChangesToFreeCutTimeline,
  applyEditPlanToFreeCutTimeline,
  buildClipMapForMedia,
  createEditPlan,
  createSingleClipLoopPlan,
  offsetEditPlanTimeline,
  replaceSegmentSource,
  slipSegmentSource,
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
  executeTimelineCommand,
  useItemsStore,
  useTimelineSettingsStore,
  useTimelineStore,
} from '@/features/editor/deps/timeline-store'
import { useSelectionStore } from '@/shared/state/selection'
import type { BeatvideoProjectMode } from '@/types/project'
import type { MusicMap } from '@/types/beatvideo'
import { BeatvideoShotBin, BeatvideoShotFrame } from './beatvideo-shot-bin'
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
  const [disabledArrangeSourceIds, setDisabledArrangeSourceIds] = useState<string[]>([])
  const [draggingShotId, setDraggingShotId] = useState<string | null>(null)
  const [dragOverSlotKey, setDragOverSlotKey] = useState<string | null>(null)
  const [sourceStartDrafts, setSourceStartDrafts] = useState<Record<string, number>>({})

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
  }, [
    autoArranging,
    describeProgress,
    importingFootage,
    preparingFootage,
    videoCandidates,
  ])

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
      const validShotIds = new Set(
        clipMap.sources.flatMap((source) => source.shots.map((shot) => shot.id)),
      )
      setExcludedShotIds((current) =>
        current.filter((shotId) => validShotIds.has(shotId)),
      )
      const shotCount = clipMap.sources.reduce(
        (total, source) => total + source.shots.length,
        0,
      )
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
  }, [
    autoArranging,
    describeProgress,
    importingFootage,
    preparingFootage,
    videoCandidates,
  ])

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
    arrangeSourceIds,
    autoArranging,
    describeProgress,
    excludedShotIds,
    loopBars,
    preparingFootage,
    resolveRelativeMusic,
    transitionProfile,
    videoCandidates,
  ])

  const applyArrangementSourceRepair = useCallback(
    async (nextPlan: EditPlan) => {
      if (!lastPlan) return null
      const result = await applyEditPlanSourceChangesToFreeCutTimeline(
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
        setSourceStartDrafts({})
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
    [
      applyArrangementSourceRepair,
      lastClipMap,
      lastPlan,
      loopBlocksGrouped,
    ],
  )

  const setGeneratedSlotEnabled = useCallback(
    (segment: EditPlan['segments'][number], enabled: boolean) => {
      if (!lastPlan || loopBlocksGrouped) return

      const targetSegments =
        segment.motifId && segment.motifSlot
          ? lastPlan.segments.filter(
              (candidate) =>
                candidate.motifId === segment.motifId &&
                candidate.motifSlot === segment.motifSlot,
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
    [
      lastItemIdBySegmentId,
      lastPlan,
      loopBlocksGrouped,
    ],
  )

  const commitArrangementSourceStart = useCallback(
    async (
      segmentId: string,
      slotKey: string,
      requestedSourceStart: number,
    ) => {
      if (!lastPlan || !lastClipMap || loopBlocksGrouped) return
      const segment = lastPlan.segments.find((candidate) => candidate.id === segmentId)
      if (!segment) return

      try {
        const delta = requestedSourceStart - segment.sourceStart
        if (Math.abs(delta) <= 1e-6) {
          setSourceStartDrafts((current) => {
            const next = { ...current }
            delete next[slotKey]
            return next
          })
          return
        }

        const nextPlan = slipSegmentSource(
          lastPlan,
          lastClipMap,
          segmentId,
          delta,
        )
        const result = await applyArrangementSourceRepair(nextPlan)
        if (!result) return
        setSourceStartDrafts((current) => {
          const next = { ...current }
          delete next[slotKey]
          return next
        })
      } catch (error) {
        setSourceStartDrafts((current) => {
          const next = { ...current }
          delete next[slotKey]
          return next
        })
        toast.error('Could not adjust this source range', {
          description: error instanceof Error ? error.message : String(error),
        })
      }
    },
    [
      applyArrangementSourceRepair,
      lastClipMap,
      lastPlan,
      loopBlocksGrouped,
    ],
  )

  const beginArrangementShotDrag = useCallback(
    (event: DragEvent<HTMLElement>, shotId: string) => {
      setDraggingShotId(shotId)
      event.dataTransfer.effectAllowed = 'copy'
      event.dataTransfer.setData(
        ARRANGEMENT_SHOT_DRAG_MIME,
        encodeArrangementShotDragPayload(shotId),
      )
      // Keep a plain-text fallback so the native drag remains valid in browsers
      // that suppress custom MIME reads until drop.
      event.dataTransfer.setData('text/plain', shotId)
    },
    [],
  )

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
    (
      event: DragEvent<HTMLDivElement>,
      slotKey: string,
      segment: EditPlan['segments'][number],
    ) => {
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
    (
      event: DragEvent<HTMLDivElement>,
      segment: EditPlan['segments'][number],
    ) => {
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
    (
      event: PointerEvent<HTMLElement>,
      shot: { sourceId: string; start: number; end: number },
    ) => {
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
    <section className="max-h-[62vh] shrink-0 space-y-3 overflow-y-auto border-b border-border px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-foreground">Footage</div>
            <div className="font-mono text-[9px] text-muted-foreground">
              {videoCandidates.length === 0
                ? 'No video added'
                : `${videoCandidates.length} source${videoCandidates.length === 1 ? '' : 's'}`}
            </div>
          </div>
        </div>
      </div>

      <Button
        type="button"
        size="sm"
        className="w-full justify-start"
        disabled={importingFootage || preparingFootage || autoArranging}
        onClick={() => void importFootage()}
      >
        {importingFootage ? 'Importing footage…' : 'Add footage'}
      </Button>

      {videoCandidates.length > 0 ? (
        <div className="border-t border-border pt-2.5">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-medium text-foreground">Shots</div>
              <div className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground">
                Review scene splits before placement. Skip weak shots; drag good shots into the sequence later.
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 px-2 text-[10px]"
              disabled={preparingFootage || autoArranging || importingFootage}
              onClick={() => void prepareCurrentFootage()}
            >
              {preparingFootage ? 'Detecting…' : lastClipMap ? 'Refresh' : 'Detect'}
            </Button>
          </div>
          {lastClipMap ? (
            <BeatvideoShotBin
              clipMap={lastClipMap}
              excludedShotIds={excludedShotIds}
              draggingShotId={draggingShotId}
              onToggleAvoid={toggleAvoidShot}
              onDragStart={beginArrangementShotDrag}
              onDragEnd={endArrangementShotDrag}
            />
          ) : (
            <div className="text-[9px] text-muted-foreground">
              Detect shots to inspect the automatic split before building an edit.
            </div>
          )}
        </div>
      ) : null}

      {videoCandidates.length > 0 ? (
        <>
          <div className="border-t border-border pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-foreground">Place on beat</span>
              <span className="font-mono text-[9px] text-muted-foreground">
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
                <span className="text-[9px] font-medium text-foreground">Sources for this build</span>
                <span className="font-mono text-[8px] tabular-nums text-muted-foreground">
                  {arrangeSourceIds.length}/{videoCandidates.length} on
                </span>
              </div>
              <div className="max-h-28 space-y-0.5 overflow-y-auto">
                {videoCandidates.map((media) => {
                  const enabled = arrangeSourceIds.includes(media.id)
                  return (
                    <label
                      key={media.id}
                      className="flex h-7 min-w-0 items-center gap-2 px-1 text-[9px] text-foreground hover:bg-secondary/35"
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
                <div className="mb-1 text-[9px] text-muted-foreground">Pace</div>
                <div className="studio-segmented grid h-8 grid-cols-3">
                  {([
                    ['relaxed', 'Relaxed'],
                    ['balanced', 'Balanced'],
                    ['energetic', 'Energetic'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={arrangePace === value}
                      onClick={() => setArrangePace(value as EditPace)}
                      className="studio-segment h-7 px-1 text-[8px] font-medium"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 text-[9px] text-muted-foreground">Transitions</div>
                <div className="studio-segmented grid h-8 grid-cols-2">
                  {([
                    ['clean', 'Cuts only'],
                    ['accent', 'Accent'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={transitionProfile === value}
                      onClick={() => setTransitionProfile(value as TransitionProfile)}
                      className="studio-segment h-7 px-1 text-[8px] font-medium"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {arrangeMode === 'loop' ? (
              <div className="mt-2">
                <div className="mb-1 text-[9px] text-muted-foreground">Loop length</div>
                <div className="studio-segmented grid h-8 grid-cols-4">
                  {[2, 4, 8, 16].map((bars) => (
                    <button
                      key={bars}
                      type="button"
                      aria-pressed={loopBars === bars}
                      onClick={() => setLoopBars(bars)}
                      className="studio-segment h-7 px-1 text-[8px] font-medium"
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
              {autoArranging
                ? 'Building…'
                : lastPlan
                  ? 'Rebuild sequence'
                  : 'Build sequence'}
            </Button>

            {lastAppliedItemIds.length > 0 && !loopBlocksGrouped ? (
              <div className="mt-2 flex items-center gap-3 border-t border-border/70 pt-2 text-[9px]">
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
            <div className="mt-2 font-mono text-[8px] leading-relaxed text-muted-foreground">
              Cuts: corrected beat grid · source audio: muted
            </div>
          </div>

          {editableArrangementSlots.length > 0 && lastClipMap ? (
            <div className="border-t border-border pt-2">
              <div className="mb-1.5 flex items-end justify-between gap-2">
                <div>
                  <div className="text-[10px] font-medium text-foreground">Sequence</div>
                  <div className="text-[8px] text-muted-foreground">
                    Drag to replace · Source slider slips footage · click preview selects cut
                  </div>
                </div>
                <span className="font-mono text-[9px] text-muted-foreground">
                  {editableArrangementSlots.length} slots
                </span>
              </div>

              <div
                className="flex gap-1 overflow-x-auto pb-1"
                data-beatvideo-arrangement-strip
              >
                {editableArrangementSlots.map(
                  ({ key, segment, shot, linkedRepeats }, index) => {
                    const duration = segmentDuration(segment)
                    const isDragTarget = dragOverSlotKey === key
                    const currentShotIsManual = segment.manualOverride === true
                    const sourceDuration = shot
                      ? (lastClipMap.sources.find((source) => source.id === shot.sourceId)?.duration ?? shot.end)
                      : duration
                    const sourceMedia = shot
                      ? mediaItems.find((candidate) => candidate.id === shot.sourceId)
                      : null
                    const sourceStep = 1 / Math.max(1, sourceMedia?.fps || 30)
                    const sourceStartMin = shot?.start ?? segment.sourceStart
                    const sourceStartMax = shot
                      ? Math.max(shot.start, shot.end - duration)
                      : segment.sourceStart
                    const sourceStartValue = Math.max(
                      sourceStartMin,
                      Math.min(
                        sourceStartMax,
                        sourceStartDrafts[key] ?? segment.sourceStart,
                      ),
                    )
                    const sourceOffset = sourceStartValue - sourceStartMin
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
                        : [lastItemIdBySegmentId[segment.id]].filter(
                            (itemId): itemId is string => Boolean(itemId),
                          )
                    const slotEnabled =
                      slotItemIds.length === 0 ||
                      slotItemIds.every(
                        (itemId) =>
                          items.find((item) => item.id === itemId)?.enabled !== false,
                      )

                    return (
                      <div
                        key={key}
                        onDragOver={(event) =>
                          handleArrangementSlotDragOver(event, key, segment)
                        }
                        onDragLeave={(event) => {
                          const nextTarget = event.relatedTarget
                          if (
                            !nextTarget ||
                            !(nextTarget instanceof Node) ||
                            !event.currentTarget.contains(nextTarget)
                          ) {
                            setDragOverSlotKey((current) =>
                              current === key ? null : current,
                            )
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
                          <span className="absolute left-1 top-1 bg-background/85 px-1 font-mono text-[8px] text-foreground/80">
                            {index + 1}
                          </span>
                          <span className="absolute bottom-1 right-1 bg-background/85 px-1 font-mono text-[8px] text-foreground/80">
                            {duration.toFixed(2)}s
                            {linkedRepeats > 1 ? ` ×${linkedRepeats}` : ''}
                          </span>
                          </div>

                          <div className="truncate border-t border-border/70 px-1.5 py-1 text-[8px] text-foreground/80">
                            {shot?.sourceName ?? 'Footage'}
                            {currentShotIsManual ? ' · edited' : ''}
                          </div>
                        </button>

                        <div className="flex h-7 items-center justify-between gap-2 border-t border-border/70 px-1.5">
                          <span className="text-[7px] text-muted-foreground">
                            {linkedRepeats > 1 ? `All ${linkedRepeats} repeats` : 'Clip'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[7px] text-muted-foreground">
                              {slotEnabled ? 'ON' : 'OFF'}
                            </span>
                            <Switch
                              checked={slotEnabled}
                              onCheckedChange={(checked) =>
                                setGeneratedSlotEnabled(segment, checked)
                              }
                              className="h-4 w-7 border border-border data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
                              aria-label={`${slotEnabled ? 'Disable' : 'Enable'} generated clip ${index + 1}`}
                            />
                          </div>
                        </div>

                        {shot && sourceStartMax > sourceStartMin + 1e-6 ? (
                          <label
                            className="block border-t border-border/70 px-1.5 py-1"
                            onPointerDown={(event) => event.stopPropagation()}
                          >
                            <span className="mb-0.5 flex items-center justify-between gap-1 text-[7px] text-muted-foreground">
                              <span>Source</span>
                              <span className="font-mono tabular-nums text-foreground/75">
                                +{sourceOffset.toFixed(2)}s
                              </span>
                            </span>
                            <input
                              type="range"
                              min={sourceStartMin}
                              max={sourceStartMax}
                              step={sourceStep}
                              value={sourceStartValue}
                              className="block h-3 w-full accent-foreground"
                              aria-label={`Source position for generated clip ${index + 1}`}
                              onChange={(event) => {
                                const nextStart = Number(event.currentTarget.value)
                                setSourceStartDrafts((current) => ({
                                  ...current,
                                  [key]: nextStart,
                                }))
                                if (sourceMedia && sourceMedia.fps > 0) {
                                  const previewTime = nextStart + duration / 2
                                  const playback = usePlaybackStore.getState()
                                  if (playback.isPlaying) playback.pause()
                                  playback.setPreviewFrame(null)
                                  useEditorStore
                                    .getState()
                                    .setMediaSkimPreview(
                                      shot.sourceId,
                                      Math.max(0, Math.round(previewTime * sourceMedia.fps)),
                                    )
                                }
                              }}
                              onPointerUp={(event) => {
                                event.stopPropagation()
                                clearArrangementShotPreview()
                                void commitArrangementSourceStart(
                                  segment.id,
                                  key,
                                  Number(event.currentTarget.value),
                                )
                              }}
                              onKeyUp={(event) => {
                                if (
                                  event.key === 'ArrowLeft' ||
                                  event.key === 'ArrowRight' ||
                                  event.key === 'Home' ||
                                  event.key === 'End'
                                ) {
                                  clearArrangementShotPreview()
                                  void commitArrangementSourceStart(
                                    segment.id,
                                    key,
                                    Number(event.currentTarget.value),
                                  )
                                }
                              }}
                            />
                          </label>
                        ) : null}
                      </div>
                    )
                  },
                )}
              </div>

            </div>
          ) : null}

          {lastPlan?.mode === 'loop' && !loopBlocksGrouped ? (
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

          {loopBlocksGrouped ? (
            <div className="border-l border-primary/50 pl-2 text-[9px] leading-relaxed text-muted-foreground">
              Every block is an instance of Loop A. Double-click any block to edit the
              underlying cuts once; all repeats update together. Undo once to return to
              the generated cuts before linking.
            </div>
          ) : null}

          <details className="border-t border-border pt-2">
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
        <div className="font-mono text-[9px] text-muted-foreground">{progressLabel}</div>
      ) : null}
      <p className="text-[9px] leading-relaxed text-muted-foreground">
        Manual placement: drag any full video from the Media library below directly onto the Media lane in the timeline.
      </p>
    </section>
  )
}
