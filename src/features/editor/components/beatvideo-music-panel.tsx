import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AudioLines,
  CheckCircle2,
  Crosshair,
  Eye,
  EyeOff,
  Film,
  LocateFixed,
  Magnet,
  Play,
  Repeat2,
  Sparkles,
  Tag,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  analyzeMusicMedia,
  getBeatvideoGridMode,
  resolveBeatvideoMusicGrid,
  resolveBeatvideoTimelineGrid,
  projectAudioReactiveBeatsToItem,
  projectAudioReactiveTransientsToItem,
  sourceSecondsToTimelineFrame,
  timelineFrameToSourceSeconds,
  type MusicAnalysisProgress,
} from '@/features/editor/deps/beatvideo-music'
import {
  resolveMediaUrl,
  useMediaLibraryStore,
} from '@/features/editor/deps/media-library'
import { updateStoredProject, useProjectStore } from '@/features/editor/deps/projects'
import {
  useItemsStore,
  useTimelineSettingsStore,
  useTimelineStore,
} from '@/features/editor/deps/timeline-store'
import {
  addItemsOnNewTracks,
  buildDroppedMediaTimelineItems,
  createClassicTrack,
  replaceItemsOnTrack,
} from '@/features/editor/deps/timeline-contract'
import { usePlaybackStore } from '@/shared/state/playback'
import {
  DEFAULT_PROJECT_HEIGHT,
  DEFAULT_PROJECT_WIDTH,
} from '@/shared/projects/defaults'
import { resolveProducerTagRepeatFrames } from '../utils/producer-tag'
import {
  applyEditPlanToFreeCutTimeline,
  buildClipMapForMedia,
  createEditPlan,
  createSingleClipLoopPlan,
  offsetEditPlanTimeline,
  type ClipMapBuildProgress,
} from '@/features/editor/deps/auto-edit-contract'
import type {
  BeatvideoGridCorrectionAnchor,
  BeatvideoGridMode,
  BeatvideoMusicAnalysis,
  MusicMap,
} from '@/types/beatvideo'

const GRID_NUDGE_SECONDS = 0.01
const ANCHOR_EPSILON = 1e-4
const ANCHOR_GAP_SECONDS = 0.001

function formatClock(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.max(0, seconds - minutes * 60)
  return `${minutes}:${remainder.toFixed(2).padStart(5, '0')}`
}

function sourceSupportsBeatAnalysis(mimeType: string, audioCodec?: string) {
  if (mimeType.startsWith('audio/')) return true
  return mimeType.startsWith('video/') && Boolean(audioCodec)
}

function phaseLabel(progress: MusicAnalysisProgress | null) {
  if (!progress) return 'Ready'
  const labels: Record<MusicAnalysisProgress['phase'], string> = {
    decode: 'Decode audio',
    prepare: 'Prepare rhythm input',
    'model-download': 'Load Beat This model',
    'model-init': 'Initialize model',
    features: 'Read rhythm features',
    inference: 'Detect beats and downbeats',
    finalize: 'Build musical grid',
  }
  return labels[progress.phase]
}

function frameInsidePlacement(
  frame: number,
  placement: { from: number; durationInFrames: number },
): boolean {
  return frame >= placement.from && frame <= placement.from + placement.durationInFrames
}

function sourceDeltaForTimelineNudge(
  placement: { speed?: number; isReversed?: boolean },
  timelineDeltaSeconds: number,
): number {
  const speed = Math.max(0.0001, placement.speed ?? 1)
  return timelineDeltaSeconds * speed * (placement.isReversed ? -1 : 1)
}

function correctionOrderAnchors(
  analysis: BeatvideoMusicAnalysis,
): BeatvideoGridCorrectionAnchor[] {
  const anchors = [...(analysis.correctionAnchors ?? [])]
  if (
    analysis.detectedBarOneTime !== null &&
    analysis.barOneTime !== null &&
    Math.abs(analysis.barOneTime - analysis.detectedBarOneTime) > ANCHOR_EPSILON
  ) {
    anchors.push({
      id: 'bar-one',
      sourceTime: analysis.detectedBarOneTime,
      correctedTime: analysis.barOneTime,
    })
  }
  return anchors.sort((left, right) => left.sourceTime - right.sourceTime)
}

function upsertCorrectionAnchor(
  anchors: readonly BeatvideoGridCorrectionAnchor[],
  next: BeatvideoGridCorrectionAnchor,
): BeatvideoGridCorrectionAnchor[] {
  const index = anchors.findIndex(
    (anchor) => Math.abs(anchor.sourceTime - next.sourceTime) <= ANCHOR_EPSILON,
  )
  if (index < 0) return [...anchors, next]
  return anchors.map((anchor, anchorIndex) => (anchorIndex === index ? next : anchor))
}

export function BeatvideoMusicPanel() {
  const mediaItems = useMediaLibraryStore((state) => state.mediaItems)
  const currentProject = useProjectStore((state) => state.currentProject)
  const items = useItemsStore((state) => state.items)
  const currentFrame = usePlaybackStore((state) => state.currentFrame)
  const fps = useTimelineSettingsStore((state) => state.fps)
  const beatGridVisible = useTimelineSettingsStore((state) => state.beatGridVisible)
  const toggleBeatGridVisible = useTimelineSettingsStore((state) => state.toggleBeatGridVisible)
  const beatGridSnapEnabled = useTimelineSettingsStore((state) => state.beatGridSnapEnabled)
  const toggleBeatGridSnap = useTimelineSettingsStore((state) => state.toggleBeatGridSnap)
  const analysis = currentProject?.beatvideoMusic
  const candidates = useMemo(
    () =>
      mediaItems.filter((media) =>
        sourceSupportsBeatAnalysis(media.mimeType, media.audioCodec),
      ),
    [mediaItems],
  )

  const [selectedMediaId, setSelectedMediaId] = useState('')
  const [selectedLoopMediaId, setSelectedLoopMediaId] = useState('')
  const [selectedTagMediaId, setSelectedTagMediaId] = useState('')
  const [tagRepeatBars, setTagRepeatBars] = useState(16)
  const [tagFirstBar, setTagFirstBar] = useState(1)
  const [tagTrimStartSeconds, setTagTrimStartSeconds] = useState('0')
  const [tagTrimEndSeconds, setTagTrimEndSeconds] = useState('')
  const [tagAnchorSeconds, setTagAnchorSeconds] = useState('0')
  const [tagDuckDb, setTagDuckDb] = useState(-3)
  const [progress, setProgress] = useState<MusicAnalysisProgress | null>(null)
  const [importingBeat, setImportingBeat] = useState(false)
  const [importingTag, setImportingTag] = useState(false)
  const [autoArranging, setAutoArranging] = useState(false)
  const [autoArrangeProgress, setAutoArrangeProgress] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [bpmDraft, setBpmDraft] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const autoEditAbortRef = useRef<AbortController | null>(null)

  const selectedAnalysis =
    analysis?.mediaId === selectedMediaId ? analysis : null
  const timelineGrid = useMemo(
    () =>
      selectedAnalysis
        ? resolveBeatvideoTimelineGrid(selectedAnalysis, items, fps)
        : null,
    [fps, items, selectedAnalysis],
  )
  const effectiveAnalysis = timelineGrid?.analysis ?? selectedAnalysis
  const resolvedSourceGrid = effectiveAnalysis
    ? resolveBeatvideoMusicGrid(effectiveAnalysis)
    : null
  const gridMode = effectiveAnalysis
    ? getBeatvideoGridMode(effectiveAnalysis)
    : 'detected'
  const barCount =
    resolvedSourceGrid?.beats.filter((beat) => beat.downbeat).length ?? 0
  const videoCandidates = useMemo(
    () => mediaItems.filter((media) => media.mimeType.startsWith('video/')),
    [mediaItems],
  )
  const tagCandidates = useMemo(
    () =>
      mediaItems.filter(
        (media) => media.mimeType.startsWith('audio/') && media.id !== selectedMediaId,
      ),
    [mediaItems, selectedMediaId],
  )

  useEffect(() => {
    if (candidates.some((media) => media.id === selectedMediaId)) return

    const preferred = analysis?.mediaId
    if (preferred && candidates.some((media) => media.id === preferred)) {
      setSelectedMediaId(preferred)
      return
    }
    setSelectedMediaId(candidates[0]?.id ?? '')
  }, [analysis?.mediaId, candidates, selectedMediaId])

  useEffect(() => {
    if (!videoCandidates.some((media) => media.id === selectedLoopMediaId)) {
      setSelectedLoopMediaId(videoCandidates[0]?.id ?? '')
    }
  }, [selectedLoopMediaId, videoCandidates])

  useEffect(() => {
    if (!tagCandidates.some((media) => media.id === selectedTagMediaId)) {
      setSelectedTagMediaId(tagCandidates[0]?.id ?? '')
    }
  }, [selectedTagMediaId, tagCandidates])

  useEffect(() => {
    setTagTrimStartSeconds('0')
    setTagTrimEndSeconds('')
    setTagAnchorSeconds('0')
  }, [selectedTagMediaId])

  useEffect(() => {
    const bpm =
      effectiveAnalysis?.bpmOverride ??
      effectiveAnalysis?.musicMap.bpm ??
      null
    setBpmDraft(bpm ? bpm.toFixed(2).replace(/\.00$/, '') : '')
  }, [effectiveAnalysis])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      autoEditAbortRef.current?.abort()
    },
    [],
  )

  const persistAnalysis = useCallback(
    async (next: BeatvideoMusicAnalysis) => {
      if (!currentProject) return
      const updated = await updateStoredProject(currentProject.id, {
        beatvideoMusic: next,
      })
      useProjectStore.getState().setCurrentProject(updated)
    },
    [currentProject],
  )

  const importBeat = useCallback(async () => {
    if (importingBeat) return
    setImportingBeat(true)
    try {
      const imported = await useMediaLibraryStore.getState().importMedia()
      if (imported.length === 0) return
      const beat = imported.find((media) =>
        sourceSupportsBeatAnalysis(media.mimeType, media.audioCodec),
      )
      if (!beat) {
        toast.error('Choose an audio file, or a video that contains audio')
        return
      }
      setSelectedMediaId(beat.id)
      toast.success('Beat imported')
    } catch (error) {
      toast.error('Could not import beat', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setImportingBeat(false)
    }
  }, [importingBeat])

  const importProducerTag = useCallback(async () => {
    if (importingTag) return
    setImportingTag(true)
    try {
      const imported = await useMediaLibraryStore.getState().importMedia()
      if (imported.length === 0) return
      const tag = imported.find(
        (media) => media.mimeType.startsWith('audio/') && media.id !== selectedMediaId,
      )
      if (!tag) {
        toast.error('Choose a short audio file for the producer tag')
        return
      }
      setSelectedTagMediaId(tag.id)
      toast.success('Producer tag imported', {
        description: 'It will be placed on the dedicated Producer tags track.',
      })
    } catch (error) {
      toast.error('Could not import producer tag', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setImportingTag(false)
    }
  }, [importingTag, selectedMediaId])

  const ensureBeatPlacement = useCallback(
    async (mediaId = selectedMediaId) => {
      const media = useMediaLibraryStore
        .getState()
        .mediaItems.find((candidate) => candidate.id === mediaId)
      if (!media || !sourceSupportsBeatAnalysis(media.mimeType, media.audioCodec)) {
        throw new Error('Select a valid beat source first')
      }

      const timeline = useTimelineStore.getState()
      const existingBeatTrack = timeline.tracks.find(
        (track) => track.kind === 'audio' && track.name === 'Beat',
      )
      const beatTrackItems = existingBeatTrack
        ? timeline.items.filter((item) => item.trackId === existingBeatTrack.id)
        : []
      const matchingBeatTrackItem = beatTrackItems.find(
        (item) =>
          (item.type === 'audio' || item.type === 'video') &&
          item.mediaId === media.id,
      )

      // A clean canonical Beat track is already exactly what this workflow needs.
      if (matchingBeatTrackItem && beatTrackItems.length === 1) {
        return matchingBeatTrackItem
      }

      // Older/manual projects may already contain this source before the dedicated
      // Beat track exists. Reuse that placement rather than creating duplicate audio.
      if (!existingBeatTrack) {
        const existingPlacement = timeline.items
          .filter(
            (item) =>
              (item.type === 'audio' || item.type === 'video') &&
              item.mediaId === media.id,
          )
          .sort((left, right) => {
            const leftAudio = left.type === 'audio'
            const rightAudio = right.type === 'audio'
            if (leftAudio !== rightAudio) return leftAudio ? -1 : 1
            return right.durationInFrames - left.durationInFrames
          })[0]
        if (existingPlacement) return existingPlacement
      }

      const blobUrl = await resolveMediaUrl(media.id)
      if (!blobUrl) throw new Error('Could not load the selected beat')
      const maxOrder = timeline.tracks.reduce(
        (max, track) => Math.max(max, track.order ?? 0),
        0,
      )
      const beatTrack =
        existingBeatTrack ??
        {
          ...createClassicTrack({
            tracks: timeline.tracks,
            kind: 'audio',
            order: maxOrder + 1,
          }),
          name: 'Beat',
          color: '#38bdf8',
        }
      const nextTracks = existingBeatTrack
        ? timeline.tracks
        : [...timeline.tracks, beatTrack]
      const durationInFrames = Math.max(
        1,
        Math.round(media.duration * timeline.fps),
      )
      const beatItems = buildDroppedMediaTimelineItems({
        media,
        mediaId: media.id,
        mediaType: 'audio',
        label: `Beat: ${media.fileName}`,
        timelineFps: timeline.fps,
        blobUrl,
        canvasWidth: currentProject?.metadata.width ?? DEFAULT_PROJECT_WIDTH,
        canvasHeight: currentProject?.metadata.height ?? DEFAULT_PROJECT_HEIGHT,
        fallbackSourceFps: timeline.fps,
        placement: {
          primary: {
            trackId: beatTrack.id,
            from: 0,
            durationInFrames,
          },
        },
      })

      if (existingBeatTrack) {
        // Switching the project beat replaces the generated Beat track in one
        // history transaction. Collision placement must never push the new beat
        // behind the old source.
        replaceItemsOnTrack(existingBeatTrack.id, beatItems)
      } else {
        addItemsOnNewTracks(beatItems, nextTracks)
      }

      const placed = beatItems.find(
        (item) => item.type === 'audio' && item.mediaId === media.id,
      )
      if (!placed) throw new Error('Could not place the selected beat')

      useSelectionStore.getState().setActiveTrack(beatTrack.id)
      useSelectionStore.getState().selectItems([placed.id])
      return placed
    },
    [
      currentProject?.metadata.height,
      currentProject?.metadata.width,
      selectedMediaId,
    ],
  )

  const analyze = useCallback(async () => {
    if (!selectedMediaId || !currentProject || analyzing) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setAnalyzing(true)
    setProgress({
      phase: 'decode',
      progress: 0,
      overallProgress: 0,
      detail: 'Starting',
    })

    try {
      await ensureBeatPlacement(selectedMediaId)
      const result = await analyzeMusicMedia(selectedMediaId, {
        signal: controller.signal,
        onProgress: setProgress,
      })
      if (result.musicMap.beats.length === 0) {
        throw new Error('No usable beats were detected. Try a clean music file or re-run analysis.')
      }

      const detectedBarOneTime =
        result.musicMap.beats.find((beat) => beat.downbeat)?.time ??
        result.musicMap.beats[0]?.time ??
        null
      const next: BeatvideoMusicAnalysis = {
        version: 2,
        mediaId: selectedMediaId,
        analyzedAt: Date.now(),
        musicMap: result.musicMap,
        detectedBarOneTime,
        barOneTime: detectedBarOneTime,
        barOneVerified: false,
        bpmOverride: null,
        gridMode: 'detected',
        correctionAnchors: [],
      }

      await persistAnalysis(next)

      const timeline = useTimelineStore.getState()
      const refreshedGrid = resolveBeatvideoTimelineGrid(next, timeline.items, timeline.fps)
      if (refreshedGrid) {
        const reactiveUpdates = timeline.items.flatMap((item) =>
          item.audioReactive?.bindings.length
            ? [{
                itemId: item.id,
                audioReactive: {
                  ...item.audioReactive,
                  beats: projectAudioReactiveBeatsToItem(
                    refreshedGrid.grid,
                    item,
                    timeline.fps,
                  ),
                  transients: projectAudioReactiveTransientsToItem(
                    refreshedGrid.grid,
                    item,
                    timeline.fps,
                  ),
                },
              }]
            : [],
        )
        timeline.setAudioReactiveStates(reactiveUpdates)
      }

      if (currentProject.beatvideoMode === 'photo') {
        const covers = timeline.items.filter((item) => item.type === 'image')
        if (covers.length === 1) {
          const cover = covers[0]!
          const durationInFrames = Math.max(1, Math.round(result.musicMap.duration * timeline.fps))
          if (cover.from !== 0 || cover.durationInFrames !== durationInFrames) {
            timeline.updateItem(cover.id, { from: 0, durationInFrames })
          }
        }
      }

      if (result.warnings.length > 0) {
        toast.warning('Beat analysis finished with warnings', {
          description: result.warnings[0],
        })
      } else {
        toast.success('Beat grid ready')
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error('Beat analysis failed', {
          description: error instanceof Error ? error.message : String(error),
        })
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setAnalyzing(false)
      setProgress(null)
    }
  }, [
    analyzing,
    currentProject,
    ensureBeatPlacement,
    persistAnalysis,
    selectedMediaId,
  ])

  const loopVideoToBeat = useCallback(async () => {
    const media = useMediaLibraryStore
      .getState()
      .mediaItems.find((candidate) => candidate.id === selectedLoopMediaId)
    if (!media || !media.mimeType.startsWith('video/')) {
      toast.error('Import and select one video clip first')
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

    const timelineStart = beatPlacement.from / timeline.fps
    const timelineDuration = beatPlacement.durationInFrames / timeline.fps

    try {
      const plan = createSingleClipLoopPlan({
        sourceId: media.id,
        sourceDuration: media.duration,
        timelineStart,
        timelineDuration,
      })
      const result = await applyEditPlanToFreeCutTimeline(plan)
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
  }, [selectedLoopMediaId, timelineGrid])

  const autoArrangeFootage = useCallback(async () => {
    if (autoArranging) return
    if (!timelineGrid) {
      toast.error('Analyze and place the beat before Auto Arrange')
      return
    }
    if (videoCandidates.length === 0) {
      toast.error('Import one or more footage clips first')
      return
    }

    const timeline = useTimelineStore.getState()
    const timelineStart = timelineGrid.placement.from / timeline.fps
    const timelineDuration = timelineGrid.placement.durationInFrames / timeline.fps
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
      toast.error('The placed beat has no usable grid points for Auto Arrange')
      return
    }

    autoEditAbortRef.current?.abort()
    const controller = new AbortController()
    autoEditAbortRef.current = controller
    setAutoArranging(true)
    setAutoArrangeProgress('Preparing footage…')

    const describeProgress = (next: ClipMapBuildProgress) => {
      const sourceNumber = Math.min(next.totalSources, next.completedSources + 1)
      if (next.phase === 'analyzing') {
        setAutoArrangeProgress(
          `Analyzing ${sourceNumber}/${next.totalSources} · ${next.fileName} · ${Math.round(next.analysisPercent ?? 0)}%`,
        )
      } else if (next.phase === 'ready') {
        setAutoArrangeProgress(
          `Footage ${next.completedSources}/${next.totalSources} ready`,
        )
      } else {
        setAutoArrangeProgress(
          `Reading footage ${sourceNumber}/${next.totalSources} · ${next.fileName}`,
        )
      }
    }

    try {
      const clipMap = await buildClipMapForMedia({
        media: videoCandidates,
        signal: controller.signal,
        analyzeMissing: true,
        onProgress: describeProgress,
      })
      const relativePlan = createEditPlan(relativeMusic, clipMap, {
        mode: 'auto',
        transitionProfile: 'mixed',
        seed: 1,
      })
      const plan = offsetEditPlanTimeline(relativePlan, timelineStart)
      const result = await applyEditPlanToFreeCutTimeline(plan)

      useSelectionStore.getState().setActiveTrack(result.targetVideoTrackId)
      useSelectionStore.getState().selectItems(result.itemIds)
      toast.success(
        `Auto arranged ${result.itemIds.length} clip${result.itemIds.length === 1 ? '' : 's'}`,
        {
          description:
            result.warnings.length > 0
              ? result.warnings[0]
              : `Built from ${clipMap.sources.length} footage source${clipMap.sources.length === 1 ? '' : 's'} on the verified beat grid.`,
        },
      )
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error('Could not auto arrange footage', {
          description: error instanceof Error ? error.message : String(error),
        })
      }
    } finally {
      if (autoEditAbortRef.current === controller) autoEditAbortRef.current = null
      setAutoArranging(false)
      setAutoArrangeProgress(null)
    }
  }, [autoArranging, timelineGrid, videoCandidates])

  const insertProducerTags = useCallback(
    async (mode: 'playhead' | 'repeat') => {
      const media = useMediaLibraryStore
        .getState()
        .mediaItems.find((candidate) => candidate.id === selectedTagMediaId)
      if (!media || !media.mimeType.startsWith('audio/')) {
        toast.error('Import and select a producer tag audio file first')
        return
      }

      const blobUrl = await resolveMediaUrl(media.id)
      if (!blobUrl) {
        toast.error('Could not load the producer tag audio')
        return
      }

      const timeline = useTimelineStore.getState()
      const requestedTrimStart = Number(tagTrimStartSeconds)
      const requestedTrimEnd =
        tagTrimEndSeconds.trim() === '' ? media.duration : Number(tagTrimEndSeconds)
      if (
        !Number.isFinite(requestedTrimStart) ||
        !Number.isFinite(requestedTrimEnd) ||
        requestedTrimStart < 0 ||
        requestedTrimEnd <= requestedTrimStart ||
        requestedTrimEnd > media.duration + 1e-6
      ) {
        toast.error('Enter a valid producer-tag trim range')
        return
      }

      const tagDurationSeconds = requestedTrimEnd - requestedTrimStart
      const requestedAnchorSeconds = Number(tagAnchorSeconds)
      if (
        !Number.isFinite(requestedAnchorSeconds) ||
        requestedAnchorSeconds < 0 ||
        requestedAnchorSeconds > tagDurationSeconds
      ) {
        toast.error('Tag anchor must sit inside the trimmed clip')
        return
      }

      const tagDurationInFrames = Math.max(
        1,
        Math.round(tagDurationSeconds * timeline.fps),
      )
      const anchorFrameOffset = Math.round(requestedAnchorSeconds * timeline.fps)
      let frames =
        mode === 'playhead'
          ? [
              Math.round(usePlaybackStore.getState().currentFrame) -
                anchorFrameOffset,
            ].filter((frame) => frame >= 0)
          : timelineGrid
            ? resolveProducerTagRepeatFrames({
                beats: timelineGrid.grid.beats,
                fps: timeline.fps,
                everyBars: tagRepeatBars,
                firstBar: tagFirstBar,
                anchorFrameOffset,
                startFrame: timelineGrid.placement.from,
                endFrame: timelineGrid.placement.from + timelineGrid.placement.durationInFrames,
                tagDurationInFrames,
              })
            : []

      if (mode === 'repeat' && !timelineGrid) {
        toast.error('Analyze and place the beat first to repeat tags on musical bars')
        return
      }

      const existingPatternIds =
        mode === 'repeat'
          ? timeline.items
              .filter(
                (item) =>
                  item.type === 'audio' &&
                  item.mediaId === media.id &&
                  item.label === `Watermark: ${media.fileName}`,
              )
              .map((item) => item.id)
          : []
      const replacingPatternIds = new Set(existingPatternIds)
      const occupied = new Set(
        timeline.items
          .filter(
            (item) =>
              item.type === 'audio' &&
              item.mediaId === media.id &&
              !replacingPatternIds.has(item.id),
          )
          .map((item) => Math.round(item.from)),
      )
      frames = frames.filter((frame) => !occupied.has(frame))

      if (frames.length === 0) {
        toast.info(
          mode === 'repeat'
            ? 'Those producer-tag positions are already on the timeline'
            : 'No producer-tag position available',
        )
        return
      }

      if (existingPatternIds.length > 0) {
        timeline.removeItems(existingPatternIds)
      }

      const currentTimeline = useTimelineStore.getState()
      const existingTagTrack = currentTimeline.tracks.find(
        (track) => track.kind === 'audio' && track.name === 'Producer tags',
      )
      const maxOrder = currentTimeline.tracks.reduce(
        (max, track) => Math.max(max, track.order ?? 0),
        0,
      )
      const tagTrack =
        existingTagTrack ??
        {
          ...createClassicTrack({
            tracks: currentTimeline.tracks,
            kind: 'audio',
            order: maxOrder + 1,
          }),
          name: 'Producer tags',
          color: '#f59e0b',
        }
      const nextTracks = existingTagTrack
        ? currentTimeline.tracks
        : [...currentTimeline.tracks, tagTrack]
      const canvasWidth = currentProject?.metadata.width ?? DEFAULT_PROJECT_WIDTH
      const canvasHeight = currentProject?.metadata.height ?? DEFAULT_PROJECT_HEIGHT
      const sourceStart = Math.round(requestedTrimStart * timeline.fps)
      const sourceEnd = Math.round(requestedTrimEnd * timeline.fps)
      const duckTargetTrackId = timelineGrid?.placement.trackId
      const tagItems = frames.flatMap((from) =>
        buildDroppedMediaTimelineItems({
          media,
          mediaId: media.id,
          mediaType: 'audio',
          label:
            mode === 'repeat'
              ? `Watermark: ${media.fileName}`
              : `Producer tag: ${media.fileName}`,
          timelineFps: timeline.fps,
          blobUrl,
          canvasWidth,
          canvasHeight,
          sourceStart,
          sourceEnd,
          fallbackSourceFps: timeline.fps,
          placement: {
            primary: {
              trackId: tagTrack.id,
              from,
              durationInFrames: tagDurationInFrames,
            },
          },
        }).map((item) =>
          item.type === 'audio' && tagDuckDb < 0
            ? {
                ...item,
                audioDucking: {
                  duckOthersDb: tagDuckDb,
                  attackSec: 0.06,
                  releaseSec: 0.22,
                  ...(duckTargetTrackId
                    ? { targetTrackIds: [duckTargetTrackId] }
                    : {}),
                },
              }
            : item,
        ),
      )

      if (existingTagTrack) {
        currentTimeline.addItems(tagItems)
      } else {
        addItemsOnNewTracks(tagItems, nextTracks)
      }

      useSelectionStore.getState().setActiveTrack(tagTrack.id)
      useSelectionStore.getState().selectItems(tagItems.map((item) => item.id))
      toast.success(
        mode === 'repeat'
          ? `Placed ${tagItems.length} watermark tags from bar ${tagFirstBar}, every ${tagRepeatBars} bars`
          : 'Producer tag added at playhead',
      )
    },
    [
      currentProject?.metadata.height,
      currentProject?.metadata.width,
      selectedTagMediaId,
      tagAnchorSeconds,
      tagDuckDb,
      tagFirstBar,
      tagRepeatBars,
      tagTrimEndSeconds,
      tagTrimStartSeconds,
      timelineGrid,
    ],
  )

  const requirePlacementAtPlayhead = useCallback(() => {
    if (!timelineGrid) {
      toast.error('Place the analyzed beat source on the timeline first')
      return null
    }
    if (!frameInsidePlacement(currentFrame, timelineGrid.placement)) {
      toast.error('Move the playhead onto the beat source first')
      return null
    }
    const sourceTime = timelineFrameToSourceSeconds(
      timelineGrid.placement,
      currentFrame,
      fps,
    )
    if (sourceTime === null) {
      toast.error('Could not map the playhead to the beat source')
      return null
    }
    return { sourceTime, timelineGrid }
  }, [currentFrame, fps, timelineGrid])

  const setBarOneAtPlayhead = useCallback(async () => {
    const mapped = requirePlacementAtPlayhead()
    if (!mapped) return

    const base = mapped.timelineGrid.analysis
    const explicitAnchors = (base.correctionAnchors ?? []).filter(
      (anchor) =>
        base.detectedBarOneTime === null ||
        Math.abs(anchor.sourceTime - base.detectedBarOneTime) > ANCHOR_EPSILON,
    )
    await persistAnalysis({
      ...base,
      version: 2,
      barOneTime: mapped.sourceTime,
      barOneVerified: true,
      correctionAnchors: explicitAnchors,
    })
    toast.success('Bar 1 aligned to playhead')
  }, [persistAnalysis, requirePlacementAtPlayhead])

  const jumpToBarOne = useCallback(() => {
    if (!timelineGrid || timelineGrid.barOneTimelineTime === null || fps <= 0) {
      toast.error('Bar 1 is outside the visible beat-source clip')
      return
    }
    usePlaybackStore
      .getState()
      .setCurrentFrame(Math.max(0, Math.round(timelineGrid.barOneTimelineTime * fps)))
  }, [fps, timelineGrid])

  const setGridMode = useCallback(
    async (mode: BeatvideoGridMode) => {
      if (!effectiveAnalysis) return
      if (mode === 'fixed') {
        const detectedBpm =
          effectiveAnalysis.bpmOverride ?? effectiveAnalysis.musicMap.bpm
        if (!detectedBpm || detectedBpm <= 0) {
          toast.error('Analyze a valid BPM before switching to Fixed BPM')
          return
        }
        await persistAnalysis({
          ...effectiveAnalysis,
          version: 2,
          gridMode: 'fixed',
          bpmOverride: detectedBpm,
          correctionAnchors: effectiveAnalysis.correctionAnchors ?? [],
        })
        return
      }

      if (effectiveAnalysis.musicMap.beats.length === 0) {
        toast.info('Run beat analysis first to use detected timing')
        return
      }

      await persistAnalysis({
        ...effectiveAnalysis,
        version: 2,
        gridMode: 'detected',
        correctionAnchors: effectiveAnalysis.correctionAnchors ?? [],
      })
    },
    [effectiveAnalysis, persistAnalysis],
  )

  const applyBpm = useCallback(async () => {
    const nextBpm = Number(bpmDraft)
    if (!Number.isFinite(nextBpm) || nextBpm < 40 || nextBpm > 300) {
      toast.error('Enter a BPM between 40 and 300')
      return
    }

    try {
      await ensureBeatPlacement(selectedMediaId)
    } catch (error) {
      toast.error('Could not use this as the project beat', {
        description: error instanceof Error ? error.message : String(error),
      })
      return
    }

    if (effectiveAnalysis) {
      await persistAnalysis({
        ...effectiveAnalysis,
        version: 2,
        bpmOverride: nextBpm,
        gridMode: 'fixed',
        correctionAnchors: effectiveAnalysis.correctionAnchors ?? [],
      })
      toast.success(`Fixed grid set to ${nextBpm} BPM`)
      return
    }

    const media = mediaItems.find((candidate) => candidate.id === selectedMediaId)
    if (!media || media.duration <= 0) {
      toast.error('Select a beat with a known duration first')
      return
    }

    const next: BeatvideoMusicAnalysis = {
      version: 2,
      mediaId: media.id,
      analyzedAt: Date.now(),
      musicMap: {
        duration: media.duration,
        bpm: nextBpm,
        beatsPerBar: 4,
        beats: [],
        sections: [],
      },
      detectedBarOneTime: null,
      barOneTime: 0,
      barOneVerified: false,
      bpmOverride: nextBpm,
      gridMode: 'fixed',
      correctionAnchors: [],
    }
    await persistAnalysis(next)
    toast.success(`Fixed grid set to ${nextBpm} BPM`)
  }, [
    bpmDraft,
    effectiveAnalysis,
    ensureBeatPlacement,
    mediaItems,
    persistAnalysis,
    selectedMediaId,
  ])

  const nudgeGrid = useCallback(
    async (timelineDeltaSeconds: number) => {
      if (!timelineGrid) {
        toast.error('Place the analyzed beat source on the timeline first')
        return
      }

      const base = timelineGrid.analysis
      const barOne = base.barOneTime ?? base.detectedBarOneTime
      if (barOne === null) return

      const sourceDelta = sourceDeltaForTimelineNudge(
        timelineGrid.placement,
        timelineDeltaSeconds,
      )
      const nextBarOne = barOne + sourceDelta
      const nextAnchors = (base.correctionAnchors ?? []).map((anchor) => ({
        ...anchor,
        correctedTime: anchor.correctedTime + sourceDelta,
      }))
      const allCorrectedTimes = [
        nextBarOne,
        ...nextAnchors.map((anchor) => anchor.correctedTime),
      ]
      if (
        allCorrectedTimes.some(
          (time) => time < 0 || time > base.musicMap.duration,
        )
      ) {
        toast.error('Grid cannot be nudged past the source boundary')
        return
      }

      await persistAnalysis({
        ...base,
        version: 2,
        barOneTime: nextBarOne,
        barOneVerified: true,
        correctionAnchors: nextAnchors,
      })
    },
    [persistAnalysis, timelineGrid],
  )

  const alignNearestBeatToPlayhead = useCallback(async () => {
    const mapped = requirePlacementAtPlayhead()
    if (!mapped) return

    const base = mapped.timelineGrid.analysis
    if (getBeatvideoGridMode(base) !== 'detected') {
      toast.error('Switch to Detected beatmap before adding correction anchors')
      return
    }

    const sourceGrid = resolveBeatvideoMusicGrid(base)
    const visibleBeats = sourceGrid.beats
      .map((beat) => ({
        beat,
        frame: sourceSecondsToTimelineFrame(
          mapped.timelineGrid.placement,
          beat.time,
          fps,
        ),
      }))
      .filter(({ frame }) =>
        frameInsidePlacement(frame, mapped.timelineGrid.placement),
      )
    const nearest = visibleBeats.reduce<
      (typeof visibleBeats)[number] | null
    >((best, candidate) => {
      if (!best) return candidate
      return Math.abs(candidate.frame - currentFrame) <
        Math.abs(best.frame - currentFrame)
        ? candidate
        : best
    }, null)

    if (!nearest) {
      toast.error('No detected beat is visible at this timeline position')
      return
    }

    const originalBeat = base.musicMap.beats.find(
      (beat) => beat.index === nearest.beat.index,
    )
    if (!originalBeat) {
      toast.error('Could not resolve the original detected beat')
      return
    }

    if (
      base.detectedBarOneTime !== null &&
      Math.abs(originalBeat.time - base.detectedBarOneTime) <= ANCHOR_EPSILON
    ) {
      const anchors = (base.correctionAnchors ?? []).filter(
        (anchor) =>
          Math.abs(anchor.sourceTime - originalBeat.time) > ANCHOR_EPSILON,
      )
      await persistAnalysis({
        ...base,
        version: 2,
        barOneTime: mapped.sourceTime,
        barOneVerified: true,
        correctionAnchors: anchors,
      })
      toast.success('Detected bar 1 aligned to playhead')
      return
    }

    const ordered = correctionOrderAnchors(base)
    const previous = [...ordered]
      .reverse()
      .find((anchor) => anchor.sourceTime < originalBeat.time - ANCHOR_EPSILON)
    const next = ordered.find(
      (anchor) => anchor.sourceTime > originalBeat.time + ANCHOR_EPSILON,
    )
    if (
      (previous &&
        mapped.sourceTime <= previous.correctedTime + ANCHOR_GAP_SECONDS) ||
      (next && mapped.sourceTime >= next.correctedTime - ANCHOR_GAP_SECONDS)
    ) {
      toast.error('This correction would cross a neighboring grid anchor')
      return
    }

    const anchor: BeatvideoGridCorrectionAnchor = {
      id: crypto.randomUUID(),
      sourceTime: originalBeat.time,
      correctedTime: mapped.sourceTime,
    }
    await persistAnalysis({
      ...base,
      version: 2,
      correctionAnchors: upsertCorrectionAnchor(
        base.correctionAnchors ?? [],
        anchor,
      ),
    })
    toast.success('Beat anchor aligned to playhead')
  }, [currentFrame, fps, persistAnalysis, requirePlacementAtPlayhead])

  const undoLastAnchor = useCallback(async () => {
    if (!effectiveAnalysis) return
    const anchors = effectiveAnalysis.correctionAnchors ?? []
    if (anchors.length === 0) return
    await persistAnalysis({
      ...effectiveAnalysis,
      version: 2,
      correctionAnchors: anchors.slice(0, -1),
    })
  }, [effectiveAnalysis, persistAnalysis])

  const resetCorrections = useCallback(async () => {
    if (!effectiveAnalysis) return
    const hasDetectedTiming = effectiveAnalysis.musicMap.beats.length > 0
    const fixedBpm =
      effectiveAnalysis.bpmOverride ?? effectiveAnalysis.musicMap.bpm ?? null
    await persistAnalysis({
      ...effectiveAnalysis,
      version: 2,
      barOneTime: hasDetectedTiming ? effectiveAnalysis.detectedBarOneTime : 0,
      barOneVerified: false,
      bpmOverride: hasDetectedTiming ? null : fixedBpm,
      gridMode: hasDetectedTiming ? 'detected' : 'fixed',
      correctionAnchors: [],
    })
    toast.success(
      hasDetectedTiming
        ? 'Beat grid reset to detected timing'
        : 'Fixed BPM grid reset to bar 1',
    )
  }, [effectiveAnalysis, persistAnalysis])

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="space-y-4">
        <div className="border-b border-border pb-3">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <AudioLines className="h-4 w-4" />
            Musical grid
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            Analyze once; only open Grid correction when the detected timing needs help.
          </p>
        </div>

        <section className="space-y-2">
          <label className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Beat source
          </label>
          {candidates.length > 0 ? (
            <select
              value={selectedMediaId}
              onChange={(event) => setSelectedMediaId(event.target.value)}
              disabled={analyzing || importingBeat}
              className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
            >
              {candidates.map((media) => (
                <option key={media.id} value={media.id}>
                  {media.fileName}
                </option>
              ))}
            </select>
          ) : (
            <div className="border-l-2 border-border pl-2 text-[10px] leading-relaxed text-muted-foreground">
              Start here by importing the beat for this project.
            </div>
          )}

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            disabled={analyzing || importingBeat}
            onClick={() => void importBeat()}
          >
            {importingBeat ? 'Importing beat…' : candidates.length > 0 ? 'Import another beat' : 'Import beat'}
          </Button>

          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={!selectedMediaId || analyzing}
            onClick={() => void analyze()}
          >
            <AudioLines className="h-3.5 w-3.5" />
            {analyzing
              ? 'Analyzing beat…'
              : effectiveAnalysis
                ? 'Analyze / replace grid'
                : 'Analyze beat'}
          </Button>

          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={40}
              max={300}
              step={0.01}
              value={bpmDraft}
              placeholder="BPM"
              disabled={!selectedMediaId || analyzing}
              onChange={(event) => setBpmDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void applyBpm()
              }}
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-secondary px-2 font-mono text-xs text-foreground"
              aria-label="Manual fixed BPM"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!selectedMediaId || analyzing || bpmDraft.trim() === ''}
              onClick={() => void applyBpm()}
            >
              Use BPM
            </Button>
          </div>

          {analyzing && progress ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{phaseLabel(progress)}</span>
                <span>{Math.round(progress.overallProgress * 100)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-[width] duration-150"
                  style={{
                    width: `${Math.max(2, progress.overallProgress * 100)}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          {effectiveAnalysis ? (
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={beatGridVisible ? 'secondary' : 'outline'}
                aria-pressed={beatGridVisible}
                onClick={toggleBeatGridVisible}
                className="justify-start"
              >
                {beatGridVisible ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
                Beat grid
              </Button>
              <Button
                type="button"
                size="sm"
                variant={beatGridSnapEnabled ? 'secondary' : 'outline'}
                aria-pressed={beatGridSnapEnabled}
                onClick={toggleBeatGridSnap}
                className="justify-start"
              >
                <Magnet className="h-3.5 w-3.5" />
                Beat snap
              </Button>
            </div>
          ) : null}

          {!analyzing && effectiveAnalysis && resolvedSourceGrid ? (
            <div className="rounded-md border border-border bg-secondary/35 p-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                Beat analysis ready
              </div>
              <div className="mt-1 font-mono text-[11px] text-foreground">
                {resolvedSourceGrid.bpm?.toFixed(2).replace(/\.00$/, '') ?? '—'} BPM
                <span className="mx-1.5 text-muted-foreground">·</span>
                {resolvedSourceGrid.beats.length} beats
                <span className="mx-1.5 text-muted-foreground">·</span>
                {barCount} bars
              </div>
              <div className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                {timelineGrid
                  ? `Grid linked to ${timelineGrid.placement.label}. Reactive effects can use it now.`
                  : 'Analysis is saved. Analyze again or set BPM to link this source as the project beat.'}
              </div>
            </div>
          ) : null}
        </section>

        {currentProject?.beatvideoMode === 'video' ? (
          <section className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <Film className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Footage arrangement
              </div>
            </div>

            {videoCandidates.length > 0 ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  className="w-full justify-start"
                  disabled={!timelineGrid || autoArranging}
                  onClick={() => void autoArrangeFootage()}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {autoArranging ? 'Auto arranging…' : 'Auto arrange footage'}
                </Button>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Uses all imported footage. Existing FreeCut scene detection supplies
                  shot boundaries; the verified beat grid and music sections choose the
                  cut cadence. It does not cut on every beat.
                </p>
                {autoArrangeProgress ? (
                  <div className="border-l-2 border-border pl-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                    {autoArrangeProgress}
                  </div>
                ) : null}

                <details className="border-t border-border pt-2">
                  <summary className="cursor-pointer list-none text-[10px] font-medium text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                    Simple loop
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    <select
                      value={selectedLoopMediaId}
                      onChange={(event) => setSelectedLoopMediaId(event.target.value)}
                      disabled={autoArranging}
                      className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
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
                      disabled={autoArranging}
                      onClick={() => void loopVideoToBeat()}
                    >
                      <Repeat2 className="h-3.5 w-3.5" />
                      Loop one clip across beat
                    </Button>
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      Repeats the full source cleanly and trims only the last repeat.
                    </p>
                  </div>
                </details>
              </>
            ) : (
              <div className="border-l-2 border-border pl-2 text-[10px] leading-relaxed text-muted-foreground">
                Import one or more footage clips in Media first.
              </div>
            )}
          </section>
        ) : null}

        <details className="border-t border-border pt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              Tags & watermark
            </span>
            <span className="text-[10px] font-normal text-muted-foreground">
              Optional
            </span>
          </summary>
          <div className="mt-3 space-y-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full justify-start"
            disabled={importingTag}
            onClick={() => void importProducerTag()}
          >
            <Tag className="h-3.5 w-3.5" />
            {importingTag ? 'Importing producer tag…' : 'Import producer tag'}
          </Button>
          <p className="text-[9px] leading-relaxed text-muted-foreground">
            Audio tags use one dedicated Producer tags track; importing one never replaces the project beat.
          </p>

          {tagCandidates.length > 0 ? (
            <>
              <select
                value={selectedTagMediaId}
                onChange={(event) => setSelectedTagMediaId(event.target.value)}
                className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
              >
                {tagCandidates.map((media) => (
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
                onClick={() => void insertProducerTags('playhead')}
              >
                <Tag className="h-3.5 w-3.5" />
                Place tag at playhead
              </Button>

              <div className="grid grid-cols-2 gap-1.5">
                <label className="space-y-1 text-[10px] text-muted-foreground">
                  <span>Start bar</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={tagFirstBar}
                    onChange={(event) =>
                      setTagFirstBar(Math.max(1, Number(event.target.value) || 1))
                    }
                    className="h-8 w-full rounded-md border border-input bg-secondary px-2 font-mono text-xs text-foreground"
                  />
                </label>
                <label className="space-y-1 text-[10px] text-muted-foreground">
                  <span>Every</span>
                  <select
                    value={tagRepeatBars}
                    onChange={(event) => setTagRepeatBars(Number(event.target.value))}
                    className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
                    aria-label="Producer tag repeat interval"
                  >
                    <option value={8}>8 bars</option>
                    <option value={16}>16 bars</option>
                    <option value={32}>32 bars</option>
                    <option value={64}>64 bars</option>
                  </select>
                </label>
              </div>

              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full justify-start"
                disabled={!timelineGrid}
                onClick={() => void insertProducerTags('repeat')}
              >
                <Repeat2 className="h-3.5 w-3.5" />
                Apply watermark pattern
              </Button>

              <details className="border-t border-border pt-2">
                <summary className="cursor-pointer list-none text-[10px] font-medium text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                  Timing & ducking
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <label className="space-y-1 text-[10px] text-muted-foreground">
                    <span>Trim start</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={tagTrimStartSeconds}
                      onChange={(event) => setTagTrimStartSeconds(event.target.value)}
                      className="h-8 w-full rounded-md border border-input bg-secondary px-2 font-mono text-xs text-foreground"
                      aria-label="Producer tag trim start in seconds"
                    />
                  </label>
                  <label className="space-y-1 text-[10px] text-muted-foreground">
                    <span>Trim end</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="Full"
                      value={tagTrimEndSeconds}
                      onChange={(event) => setTagTrimEndSeconds(event.target.value)}
                      className="h-8 w-full rounded-md border border-input bg-secondary px-2 font-mono text-xs text-foreground"
                      aria-label="Producer tag trim end in seconds"
                    />
                  </label>
                  <label className="space-y-1 text-[10px] text-muted-foreground">
                    <span>Anchor in clip</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={tagAnchorSeconds}
                      onChange={(event) => setTagAnchorSeconds(event.target.value)}
                      className="h-8 w-full rounded-md border border-input bg-secondary px-2 font-mono text-xs text-foreground"
                      aria-label="Producer tag anchor in seconds"
                    />
                  </label>
                  <label className="space-y-1 text-[10px] text-muted-foreground">
                    <span>Duck beat</span>
                    <select
                      value={tagDuckDb}
                      onChange={(event) => setTagDuckDb(Number(event.target.value))}
                      className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
                    >
                      <option value={0}>Off</option>
                      <option value={-2}>−2 dB</option>
                      <option value={-3}>−3 dB</option>
                      <option value={-4}>−4 dB</option>
                      <option value={-6}>−6 dB</option>
                    </select>
                  </label>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  Anchor is the moment inside the tag that lands on the bar. The voice
                  keeps its natural speed; only placement changes.
                </p>
              </details>

              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Repeats stay as normal timeline clips. Move, trim, fade, mute at −60 dB
                or delete any occurrence without changing the rest.
              </p>
            </>
          ) : (
            <div className="border-l-2 border-border pl-2 text-[10px] leading-relaxed text-muted-foreground">
              Import a short producer-tag audio file above. The beat source itself is never reused as a tag.
            </div>
          )}
          </div>
        </details>

        {effectiveAnalysis && resolvedSourceGrid ? (
          <>
            <section className="grid grid-cols-3 gap-1.5">
              <div className="border-t border-border pt-2">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  BPM
                </div>
                <div className="mt-1 font-mono text-sm text-foreground">
                  {resolvedSourceGrid.bpm?.toFixed(2).replace(/\.00$/, '') ?? '—'}
                </div>
              </div>
              <div className="border-t border-border pt-2">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  Beats / bar
                </div>
                <div className="mt-1 font-mono text-sm text-foreground">
                  {resolvedSourceGrid.beatsPerBar}
                </div>
              </div>
              <div className="border-t border-border pt-2">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  Bars
                </div>
                <div className="mt-1 font-mono text-sm text-foreground">
                  {barCount}
                </div>
              </div>
            </section>

            <details className="border-t border-border pt-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                <span>Grid correction</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {gridMode === 'fixed' ? 'Fixed BPM' : 'Detected beatmap'}
                </span>
              </summary>
              <div className="mt-3 space-y-3">
                <section className="space-y-2">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Grid type
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={gridMode === 'detected' ? 'default' : 'outline'}
                      disabled={effectiveAnalysis.musicMap.beats.length === 0}
                      onClick={() => void setGridMode('detected')}
                    >
                      Detected beatmap
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={gridMode === 'fixed' ? 'default' : 'outline'}
                      onClick={() => void setGridMode('fixed')}
                    >
                      Fixed BPM
                    </Button>
                  </div>
                  <p className="text-[10px] leading-relaxed text-muted-foreground">
                    Detected keeps Beat This beat timing. Fixed BPM intentionally makes
                    one even tempo grid.
                  </p>
                </section>

                <section className="space-y-2 border-t border-border pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Timeline link
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {timelineGrid
                          ? `Linked to ${timelineGrid.placement.label}`
                          : 'Place this beat source on the timeline to show its grid.'}
                      </div>
                    </div>
                    {timelineGrid ? (
                      <LocateFixed className="h-3.5 w-3.5 text-primary" />
                    ) : null}
                  </div>
                </section>

                <section className="space-y-2">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Grid alignment
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!timelineGrid}
                      onClick={() => void nudgeGrid(-GRID_NUDGE_SECONDS)}
                    >
                      −10 ms
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!timelineGrid}
                      onClick={() => void nudgeGrid(GRID_NUDGE_SECONDS)}
                    >
                      +10 ms
                    </Button>
                  </div>
                  {gridMode === 'detected' ? (
                    <Button
                      type="button"
                      size="sm"
                      className="w-full justify-start"
                      disabled={!timelineGrid}
                      onClick={() => void alignNearestBeatToPlayhead()}
                    >
                      <Crosshair className="h-3.5 w-3.5" />
                      Align nearest beat to playhead
                    </Button>
                  ) : null}
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="flex-1 justify-start"
                      disabled={(effectiveAnalysis.correctionAnchors?.length ?? 0) === 0}
                      onClick={() => void undoLastAnchor()}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      Undo anchor
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="flex-1"
                      onClick={() => void resetCorrections()}
                    >
                      Reset grid
                    </Button>
                  </div>
                </section>

                <section className="space-y-2 border-t border-border pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Bar 1
                      </div>
                      <div className="mt-1 font-mono text-sm text-foreground">
                        {formatClock(timelineGrid?.barOneTimelineTime ?? null)}
                      </div>
                    </div>
                    <span className="text-[9px] text-muted-foreground">
                      {effectiveAnalysis.barOneVerified ? 'Verified' : 'Detected'}
                    </span>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    className="w-full justify-start"
                    disabled={!timelineGrid}
                    onClick={() => void setBarOneAtPlayhead()}
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                    Set bar 1 at playhead
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    disabled={!timelineGrid || timelineGrid.barOneTimelineTime === null}
                    onClick={jumpToBarOne}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Go to bar 1
                  </Button>
                </section>

              </div>
            </details>
          </>
        ) : null}
      </div>
    </div>
  )
}