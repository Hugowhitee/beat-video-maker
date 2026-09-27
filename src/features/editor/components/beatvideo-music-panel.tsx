import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AudioLines,
  CheckCircle2,
  Crosshair,
  Eye,
  EyeOff,
  Focus,
  LocateFixed,
  Magnet,
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
  captureSnapshot,
  useItemsStore,
  useTimelineCommandStore,
  useTimelineSettingsStore,
  useTimelineStore,
  useTimelineViewportStore,
  useZoomStore,
} from '@/features/editor/deps/timeline-store'
import {
  addItemsOnNewTracks,
  buildDroppedMediaTimelineItems,
  createClassicTrack,
  replaceItemsOnTrack,
} from '@/features/editor/deps/timeline-contract'
import { usePlaybackStore } from '@/shared/state/playback'
import { useSelectionStore } from '@/shared/state/selection'
import {
  DEFAULT_PROJECT_HEIGHT,
  DEFAULT_PROJECT_WIDTH,
} from '@/shared/projects/defaults'
import { resolveProducerTagRepeatFrames } from '../utils/producer-tag'
import {
  resolveBeatGridFocusZoomLevel,
  resolveNearestBeatOffsetMs,
} from '../utils/beat-grid-focus'
import type {
  BeatvideoGridCorrectionAnchor,
  BeatvideoGridMode,
  BeatvideoMusicAnalysis,
  MusicMap,
} from '@/types/beatvideo'

const ANCHOR_EPSILON = 1e-4
const ANCHOR_GAP_SECONDS = 0.001
const ANALYSIS_STRIP_BINS = 96

function buildAnalysisStripBins(map: MusicMap) {
  const bins = Array.from({ length: ANALYSIS_STRIP_BINS }, () => ({
    low: 0,
    mid: 0,
    high: 0,
  }))
  if (map.duration <= 0) return bins

  for (const transient of map.transients ?? []) {
    const index = Math.max(
      0,
      Math.min(
        ANALYSIS_STRIP_BINS - 1,
        Math.floor((transient.time / map.duration) * ANALYSIS_STRIP_BINS),
      ),
    )
    const bin = bins[index]!
    bin.low = Math.max(bin.low, transient.low)
    bin.mid = Math.max(bin.mid, transient.mid)
    bin.high = Math.max(bin.high, transient.high)
  }
  return bins
}

function BeatAnalysisStrip({
  map,
  barOneTime,
}: {
  map: MusicMap
  barOneTime: number | null
}) {
  const bins = useMemo(() => buildAnalysisStripBins(map), [map])
  const hasEvidence = (map.transients?.length ?? 0) > 0
  if (!hasEvidence) return null

  const fit = map.gridFit
  const markerLeft = (time: number) =>
    `${Math.max(0, Math.min(100, (time / Math.max(map.duration, 1e-6)) * 100))}%`

  return (
    <div className="mt-2 space-y-1.5">
      <div
        className="relative h-12 overflow-hidden rounded-sm border border-border bg-background/70"
        aria-label="Spectral onset evidence with beat and downbeat markers"
      >
        <div
          className="grid h-full"
          style={{
            gridTemplateColumns: `repeat(${ANALYSIS_STRIP_BINS}, minmax(0, 1fr))`,
          }}
        >
          {bins.map((bin, index) => (
            <div key={index} className="grid min-w-0 grid-rows-3 gap-px">
              <span
                className="bg-fuchsia-400"
                style={{ opacity: 0.08 + bin.high * 0.82 }}
              />
              <span
                className="bg-amber-400"
                style={{ opacity: 0.08 + bin.mid * 0.82 }}
              />
              <span
                className="bg-sky-400"
                style={{ opacity: 0.08 + bin.low * 0.82 }}
              />
            </div>
          ))}
        </div>

        {map.beats.map((beat) => {
          const isBarOne =
            barOneTime !== null &&
            Math.abs(beat.time - barOneTime) <=
              Math.max(0.015, (60 / Math.max(map.bpm ?? 120, 1)) * 0.12)
          return (
            <span
              key={`evidence-beat-${beat.index}-${beat.time.toFixed(4)}`}
              className={
                isBarOne
                  ? 'absolute inset-y-0 w-[2px] bg-primary shadow-[0_0_0_1px_rgba(0,0,0,0.25)]'
                  : beat.downbeat
                    ? 'absolute inset-y-0 w-px bg-white/70'
                    : 'absolute inset-y-0 w-px bg-white/18'
              }
              style={{ left: markerLeft(beat.time) }}
            />
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-muted-foreground">
        <span><span className="text-sky-400">■</span> low</span>
        <span><span className="text-amber-400">■</span> mid</span>
        <span><span className="text-fuchsia-400">■</span> high</span>
        <span><span className="text-white/70">│</span> downbeat</span>
        <span><span className="text-primary">│</span> bar 1</span>
        {fit ? (
          <span className="ml-auto font-mono">
            {fit.mode === 'fixed' ? 'Stable grid' : 'Variable map'}
            {' · '}
            {Math.round(fit.confidence * 100)}%
          </span>
        ) : null}
      </div>
    </div>
  )
}

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
  const [selectedTagMediaId, setSelectedTagMediaId] = useState('')
  const [selectedWatermarkMediaId, setSelectedWatermarkMediaId] = useState('')
  const [beatTool, setBeatTool] = useState<'grid' | 'tags'>('grid')
  const [precisionAlignOpen, setPrecisionAlignOpen] = useState(false)
  const [tagTool, setTagTool] = useState<'producer' | 'watermark'>('producer')
  const [tagRepeatBars, setTagRepeatBars] = useState(16)
  const [tagFirstBar, setTagFirstBar] = useState(1)
  const [tagTrimStartSeconds, setTagTrimStartSeconds] = useState('0')
  const [tagTrimEndSeconds, setTagTrimEndSeconds] = useState('')
  const [tagAnchorSeconds, setTagAnchorSeconds] = useState('0')
  const [tagDuckDb, setTagDuckDb] = useState(-3)
  const [progress, setProgress] = useState<MusicAnalysisProgress | null>(null)
  const [importingBeat, setImportingBeat] = useState(false)
  const [importingTag, setImportingTag] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [bpmDraft, setBpmDraft] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const selectedAnalysis =
    analysis?.mediaId === selectedMediaId ? analysis : null
  const timelineGrid = useMemo(
    () =>
      selectedAnalysis
        ? resolveBeatvideoTimelineGrid(selectedAnalysis, items, fps)
        : null,
    [fps, items, selectedAnalysis],
  )
  const playheadBeatOffsetMs = useMemo(
    () =>
      timelineGrid && fps > 0
        ? resolveNearestBeatOffsetMs(timelineGrid.grid.beats, currentFrame / fps)
        : null,
    [currentFrame, fps, timelineGrid],
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
    if (!tagCandidates.some((media) => media.id === selectedTagMediaId)) {
      setSelectedTagMediaId(tagCandidates[0]?.id ?? '')
    }
    if (
      selectedWatermarkMediaId &&
      !tagCandidates.some((media) => media.id === selectedWatermarkMediaId)
    ) {
      setSelectedWatermarkMediaId('')
    }
  }, [selectedTagMediaId, selectedWatermarkMediaId, tagCandidates])

  const activeTagMediaId =
    tagTool === 'producer' ? selectedTagMediaId : selectedWatermarkMediaId

  useEffect(() => {
    setTagTrimStartSeconds('0')
    setTagTrimEndSeconds('')
    setTagAnchorSeconds('0')
  }, [activeTagMediaId, tagTool])

  useEffect(() => {
    const bpm =
      effectiveAnalysis?.bpmOverride ??
      effectiveAnalysis?.musicMap.bpm ??
      null
    setBpmDraft(bpm ? bpm.toFixed(2).replace(/\.00$/, '') : '')
  }, [effectiveAnalysis])

  useEffect(() => () => abortRef.current?.abort(), [])

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

  const ensureTagTrack = useCallback((kind: 'producer' | 'watermark') => {
    const timeline = useTimelineStore.getState()
    const trackName = kind === 'producer' ? 'Producer tags' : 'Watermarks'
    const existing = timeline.tracks.find(
      (track) => track.kind === 'audio' && track.name === trackName,
    )
    if (existing) return existing

    const before = captureSnapshot()
    const maxOrder = timeline.tracks.reduce(
      (max, track) => Math.max(max, track.order ?? 0),
      0,
    )
    const track = {
      ...createClassicTrack({
        tracks: timeline.tracks,
        kind: 'audio',
        order: maxOrder + 1,
      }),
      name: trackName,
      color: kind === 'producer' ? '#f59e0b' : '#14b8a6',
    }
    timeline.setTracks([...timeline.tracks, track])
    timeline.markDirty()
    useTimelineCommandStore.getState().addUndoEntry(
      { type: 'CREATE_TAG_TRACK', payload: { kind } },
      before,
    )
    return track
  }, [])

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

  const importTagAudio = useCallback(
    async (kind: 'producer' | 'watermark') => {
      if (importingTag) return
      setImportingTag(true)
      try {
        const imported = await useMediaLibraryStore.getState().importMedia()
        if (imported.length === 0) return
        const tag = imported.find(
          (media) => media.mimeType.startsWith('audio/') && media.id !== selectedMediaId,
        )
        if (!tag) {
          toast.error(`Choose a short audio file for the ${kind === 'producer' ? 'producer tag' : 'watermark'}`)
          return
        }

        if (kind === 'producer') setSelectedTagMediaId(tag.id)
        else setSelectedWatermarkMediaId(tag.id)
        ensureTagTrack(kind)
        setTagTool(kind)
        toast.success(kind === 'producer' ? 'Producer tag imported' : 'Watermark imported', {
          description:
            kind === 'producer'
              ? 'It will use the dedicated Producer tags track.'
              : 'It will use the dedicated Watermarks track.',
        })
      } catch (error) {
        toast.error(kind === 'producer' ? 'Could not import producer tag' : 'Could not import watermark', {
          description: error instanceof Error ? error.message : String(error),
        })
      } finally {
        setImportingTag(false)
      }
    },
    [ensureTagTrack, importingTag, selectedMediaId],
  )

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

  const insertTagAudio = useCallback(
    async (kind: 'producer' | 'watermark') => {
      const mediaId = kind === 'producer' ? selectedTagMediaId : selectedWatermarkMediaId
      const media = useMediaLibraryStore
        .getState()
        .mediaItems.find((candidate) => candidate.id === mediaId)
      if (!media || !media.mimeType.startsWith('audio/')) {
        toast.error(
          kind === 'producer'
            ? 'Import and select a producer tag first'
            : 'Import and select a watermark first',
        )
        return
      }

      if (kind === 'watermark' && !timelineGrid) {
        toast.error('Analyze and place the beat first to align the watermark pattern')
        return
      }

      const blobUrl = await resolveMediaUrl(media.id)
      if (!blobUrl) {
        toast.error('Could not load the selected tag audio')
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
        toast.error('Enter a valid trim range')
        return
      }

      const tagDurationSeconds = requestedTrimEnd - requestedTrimStart
      const requestedAnchorSeconds = Number(tagAnchorSeconds)
      if (
        !Number.isFinite(requestedAnchorSeconds) ||
        requestedAnchorSeconds < 0 ||
        requestedAnchorSeconds > tagDurationSeconds
      ) {
        toast.error('Anchor must sit inside the trimmed clip')
        return
      }

      const tagDurationInFrames = Math.max(1, Math.round(tagDurationSeconds * timeline.fps))
      const anchorFrameOffset = Math.round(requestedAnchorSeconds * timeline.fps)
      const frames =
        kind === 'producer'
          ? [
              Math.round(usePlaybackStore.getState().currentFrame) - anchorFrameOffset,
            ].filter((frame) => frame >= 0)
          : resolveProducerTagRepeatFrames({
              beats: timelineGrid!.grid.beats,
              fps: timeline.fps,
              everyBars: tagRepeatBars,
              firstBar: tagFirstBar,
              anchorFrameOffset,
              startFrame: timelineGrid!.placement.from,
              endFrame: timelineGrid!.placement.from + timelineGrid!.placement.durationInFrames,
              tagDurationInFrames,
            })

      if (frames.length === 0) {
        toast.info(kind === 'producer' ? 'No producer-tag position available' : 'No watermark positions available')
        return
      }

      const trackName = kind === 'producer' ? 'Producer tags' : 'Watermarks'
      const labelPrefix = kind === 'producer' ? 'Producer tag' : 'Watermark'
      const trackColor = kind === 'producer' ? '#f59e0b' : '#14b8a6'
      const currentTimeline = useTimelineStore.getState()
      const existingTrack = currentTimeline.tracks.find(
        (track) => track.kind === 'audio' && track.name === trackName,
      )
      const maxOrder = currentTimeline.tracks.reduce(
        (max, track) => Math.max(max, track.order ?? 0),
        0,
      )
      const targetTrack =
        existingTrack ??
        {
          ...createClassicTrack({
            tracks: currentTimeline.tracks,
            kind: 'audio',
            order: maxOrder + 1,
          }),
          name: trackName,
          color: trackColor,
        }
      const nextTracks = existingTrack
        ? currentTimeline.tracks
        : [...currentTimeline.tracks, targetTrack]
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
          label: `${labelPrefix}: ${media.fileName}`,
          timelineFps: timeline.fps,
          blobUrl,
          canvasWidth,
          canvasHeight,
          sourceStart,
          sourceEnd,
          fallbackSourceFps: timeline.fps,
          placement: {
            primary: {
              trackId: targetTrack.id,
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
                  ...(duckTargetTrackId ? { targetTrackIds: [duckTargetTrackId] } : {}),
                },
              }
            : item,
        ),
      )

      if (existingTrack) {
        if (kind === 'watermark') {
          replaceItemsOnTrack(existingTrack.id, tagItems)
        } else {
          currentTimeline.addItems(tagItems)
        }
      } else {
        addItemsOnNewTracks(tagItems, nextTracks)
      }

      useSelectionStore.getState().setActiveTrack(targetTrack.id)
      useSelectionStore.getState().selectItems(tagItems.map((item) => item.id))
      toast.success(
        kind === 'producer'
          ? 'Producer tag added at playhead'
          : `Watermark placed from bar ${tagFirstBar}, every ${tagRepeatBars} bars`,
      )
    },
    [
      currentProject?.metadata.height,
      currentProject?.metadata.width,
      selectedTagMediaId,
      selectedWatermarkMediaId,
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

  const focusTimelineFrame = useCallback(
    (frame: number) => {
      if (!timelineGrid || fps <= 0) return
      if (!beatGridVisible) toggleBeatGridVisible()

      const zoomLevel = resolveBeatGridFocusZoomLevel(timelineGrid.grid)
      useZoomStore.getState().setZoomLevelSynchronized(zoomLevel)
      usePlaybackStore.getState().setCurrentFrame(Math.max(0, Math.round(frame)))
      setPrecisionAlignOpen(true)

      const center = () =>
        useTimelineViewportStore.getState().requestCenterOnFrame(Math.max(0, Math.round(frame)))
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(center)
      } else {
        center()
      }
    },
    [beatGridVisible, fps, timelineGrid, toggleBeatGridVisible],
  )

  const focusBarOneOnTimeline = useCallback(() => {
    if (!timelineGrid || timelineGrid.barOneTimelineTime === null || fps <= 0) {
      toast.error('Bar 1 is outside the visible beat-source clip')
      return
    }
    focusTimelineFrame(timelineGrid.barOneTimelineTime * fps)
  }, [focusTimelineFrame, fps, timelineGrid])

  const focusCurrentBeatOnTimeline = useCallback(() => {
    if (!timelineGrid || fps <= 0) {
      toast.error('Place the analyzed beat source on the timeline first')
      return
    }

    const nearest = timelineGrid.grid.beats.reduce<
      (typeof timelineGrid.grid.beats)[number] | null
    >((best, beat) => {
      if (!best) return beat
      return Math.abs(beat.time * fps - currentFrame) <
        Math.abs(best.time * fps - currentFrame)
        ? beat
        : best
    }, null)
    if (!nearest) return
    focusTimelineFrame(nearest.time * fps)
  }, [currentFrame, focusTimelineFrame, fps, timelineGrid])

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

  const alignGridToPlayhead = useCallback(async () => {
    if (!timelineGrid || fps <= 0) {
      toast.error('Place the analyzed beat source on the timeline first')
      return
    }
    if (!frameInsidePlacement(currentFrame, timelineGrid.placement)) {
      toast.error('Move the playhead onto the beat source first')
      return
    }

    const nearest = timelineGrid.grid.beats.reduce<
      (typeof timelineGrid.grid.beats)[number] | null
    >((best, beat) => {
      if (!best) return beat
      return Math.abs(beat.time * fps - currentFrame) <
        Math.abs(best.time * fps - currentFrame)
        ? beat
        : best
    }, null)
    if (!nearest) {
      toast.error('No beat is visible at this timeline position')
      return
    }

    const timelineDeltaSeconds = currentFrame / fps - nearest.time
    if (Math.abs(timelineDeltaSeconds) < 0.0005) {
      toast.info('Grid is already aligned to the playhead')
      return
    }

    await nudgeGrid(timelineDeltaSeconds)
    toast.success('Whole beat grid aligned to playhead')
  }, [currentFrame, fps, nudgeGrid, timelineGrid])

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
            Beat
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            One project beat owns the grid, snapping, reactive timing and tag placement.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-secondary/20 p-1">
          <button
            type="button"
            aria-pressed={beatTool === 'grid'}
            onClick={() => setBeatTool('grid')}
            className={`h-8 rounded text-[10px] font-semibold transition-colors ${
              beatTool === 'grid'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
            }`}
          >
            Grid
          </button>
          <button
            type="button"
            aria-pressed={beatTool === 'tags'}
            onClick={() => setBeatTool('tags')}
            className={`h-8 rounded text-[10px] font-semibold transition-colors ${
              beatTool === 'tags'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
            }`}
          >
            Tags
          </button>
        </div>

        <section className={beatTool === 'grid' ? 'space-y-2' : 'hidden'}>
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
              {timelineGrid ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full justify-start"
                  onClick={() => void alignGridToPlayhead()}
                >
                  <Crosshair className="h-3.5 w-3.5" />
                  Align whole grid to playhead
                </Button>
              ) : null}
              <BeatAnalysisStrip
                map={resolvedSourceGrid}
                barOneTime={
                  effectiveAnalysis.barOneTime ?? effectiveAnalysis.detectedBarOneTime
                }
              />
              {resolvedSourceGrid.gridFit ? (
                <div className="mt-1.5 font-mono text-[9px] leading-relaxed text-muted-foreground">
                  {resolvedSourceGrid.gridFit.mode === 'fixed'
                    ? `Stable phase · ${resolvedSourceGrid.gridFit.medianErrorMs ?? '—'} ms detector error · ${resolvedSourceGrid.gridFit.phaseShiftMs >= 0 ? '+' : ''}${resolvedSourceGrid.gridFit.phaseShiftMs} ms onset correction`
                    : 'Variable timing preserved · use Grid correction only where the scan is visibly wrong'}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section
          className={
            beatTool === 'tags'
              ? 'space-y-3 border-t border-border pt-3'
              : 'hidden'
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-foreground">Tag audio</div>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                Place one producer tag, or repeat a watermark across musical bars.
              </p>
            </div>
            <span className="text-[9px] text-muted-foreground">Optional</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              aria-pressed={tagTool === 'producer'}
              onClick={() => setTagTool('producer')}
              className={`min-h-12 rounded-md border px-2.5 py-2 text-left transition-colors ${
                tagTool === 'producer'
                  ? 'border-primary/60 bg-primary/10 text-foreground'
                  : 'border-border bg-secondary/25 text-muted-foreground hover:border-foreground/25 hover:bg-secondary/50 hover:text-foreground'
              }`}
            >
              <span className="block text-[11px] font-semibold">Producer tag</span>
              <span className="mt-0.5 block text-[9px] leading-tight opacity-75">
                Place once at playhead
              </span>
            </button>
            <button
              type="button"
              aria-pressed={tagTool === 'watermark'}
              onClick={() => setTagTool('watermark')}
              className={`min-h-12 rounded-md border px-2.5 py-2 text-left transition-colors ${
                tagTool === 'watermark'
                  ? 'border-primary/60 bg-primary/10 text-foreground'
                  : 'border-border bg-secondary/25 text-muted-foreground hover:border-foreground/25 hover:bg-secondary/50 hover:text-foreground'
              }`}
            >
              <span className="block text-[11px] font-semibold">Watermark</span>
              <span className="mt-0.5 block text-[9px] leading-tight opacity-75">
                Repeat across bars
              </span>
            </button>
          </div>

          <div className="space-y-2">

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              disabled={importingTag}
              onClick={() => void importTagAudio(tagTool)}
            >
              {importingTag
                ? 'Importing…'
                : tagTool === 'producer'
                  ? 'Import producer tag'
                  : 'Import watermark'}
            </Button>

            <p className="text-[9px] leading-relaxed text-muted-foreground">
              {tagTool === 'producer'
                ? 'One-shot producer tags go on their own Producer tags track.'
                : 'Repeated protection tags use a separate Watermarks track and never replace the producer tag.'}
            </p>

            {tagCandidates.length > 0 ? (
              <>
                <select
                  value={activeTagMediaId}
                  onChange={(event) => {
                    if (tagTool === 'producer') setSelectedTagMediaId(event.target.value)
                    else setSelectedWatermarkMediaId(event.target.value)
                  }}
                  className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
                >
                  <option value="">
                    {tagTool === 'producer' ? 'Choose producer tag…' : 'Choose watermark…'}
                  </option>
                  {tagCandidates.map((media) => (
                    <option key={media.id} value={media.id}>
                      {media.fileName}
                    </option>
                  ))}
                </select>

                {tagTool === 'producer' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={!selectedTagMediaId}
                    onClick={() => void insertTagAudio('producer')}
                  >
                    Place at playhead
                  </Button>
                ) : (
                  <>
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
                        <span>Every bars</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          list="watermark-repeat-presets"
                          value={tagRepeatBars}
                          onChange={(event) =>
                            setTagRepeatBars(Math.max(1, Number(event.target.value) || 1))
                          }
                          className="h-8 w-full rounded-md border border-input bg-secondary px-2 font-mono text-xs text-foreground"
                          aria-label="Watermark repeat interval"
                        />
                        <datalist id="watermark-repeat-presets">
                          <option value="8" />
                          <option value="16" />
                          <option value="32" />
                          <option value="64" />
                        </datalist>
                      </label>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={!timelineGrid || !selectedWatermarkMediaId}
                      onClick={() => void insertTagAudio('watermark')}
                    >
                      Apply watermark pattern
                    </Button>
                  </>
                )}

                <details className="border-t border-border pt-2">
                  <summary className="cursor-pointer list-none text-[10px] font-medium text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                    More timing options
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
                      />
                    </label>
                    <label className="space-y-1 text-[10px] text-muted-foreground">
                      <span>Tag hit (s)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={tagAnchorSeconds}
                        onChange={(event) => setTagAnchorSeconds(event.target.value)}
                        className="h-8 w-full rounded-md border border-input bg-secondary px-2 font-mono text-xs text-foreground"
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
                </details>
              </>
            ) : (
              <div className="border-l-2 border-border pl-2 text-[10px] leading-relaxed text-muted-foreground">
                Import a short audio file for the selected tag type.
              </div>
            )}
          </div>
        </section>

        {beatTool === 'grid' && effectiveAnalysis && resolvedSourceGrid ? (
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

            <section className="space-y-2 border-t border-border pt-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Precision align
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                    Zoom the real timeline waveform around a beat, drag the playhead onto the onset,
                    then align the grid. No second waveform or hidden timing axis.
                  </p>
                </div>
                {playheadBeatOffsetMs !== null ? (
                  <span className="shrink-0 rounded-sm border border-border bg-background/60 px-1.5 py-1 font-mono text-[9px] text-foreground">
                    {playheadBeatOffsetMs >= 0 ? '+' : ''}
                    {playheadBeatOffsetMs.toFixed(1)} ms
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="justify-start"
                  disabled={!timelineGrid || timelineGrid.barOneTimelineTime === null}
                  onClick={focusBarOneOnTimeline}
                >
                  <Focus className="h-3.5 w-3.5" />
                  Focus bar 1
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="justify-start"
                  disabled={!timelineGrid}
                  onClick={focusCurrentBeatOnTimeline}
                >
                  <Crosshair className="h-3.5 w-3.5" />
                  Focus nearest beat
                </Button>
              </div>

              {precisionAlignOpen ? (
                <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-2.5">
                  <div className="text-[9px] leading-relaxed text-muted-foreground">
                    The timeline below is now zoomed to onset detail. Drag/scrub the playhead to the
                    kick or transient you want the line to hit.
                  </div>

                  <div className="grid grid-cols-4 gap-1">
                    {[
                      [-0.01, '−10'],
                      [-0.001, '−1'],
                      [0.001, '+1'],
                      [0.01, '+10'],
                    ].map(([seconds, label]) => (
                      <Button
                        key={label}
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!timelineGrid}
                        onClick={() => void nudgeGrid(Number(seconds))}
                        className="px-1 font-mono text-[9px]"
                      >
                        {label} ms
                      </Button>
                    ))}
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    className="w-full justify-start"
                    disabled={!timelineGrid}
                    onClick={() => void alignGridToPlayhead()}
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                    Align whole grid to playhead
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    disabled={!timelineGrid}
                    onClick={() => void setBarOneAtPlayhead()}
                  >
                    Set bar 1 at playhead
                  </Button>

                  {gridMode === 'detected' ? (
                    <details className="border-t border-border/70 pt-2">
                      <summary className="cursor-pointer list-none text-[9px] font-medium text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                        Track drifts later?
                      </summary>
                      <div className="mt-2 space-y-1.5">
                        <p className="text-[8px] leading-relaxed text-muted-foreground">
                          Move to the drifting beat and pin only that local point. Neighboring anchors
                          stay ordered so the correction cannot fold over itself.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-full justify-start"
                          disabled={!timelineGrid}
                          onClick={() => void alignNearestBeatToPlayhead()}
                        >
                          Pin local beat to playhead
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="w-full justify-start"
                          disabled={(effectiveAnalysis.correctionAnchors?.length ?? 0) === 0}
                          onClick={() => void undoLastAnchor()}
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                          Undo last local anchor
                        </Button>
                      </div>
                    </details>
                  ) : null}

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="w-full"
                    onClick={() => setPrecisionAlignOpen(false)}
                  >
                    Done aligning
                  </Button>
                </div>
              ) : null}
            </section>

            <details className="border-t border-border pt-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                <span>Manual grid tools</span>
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
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => void resetCorrections()}
                  >
                    Reset grid to analysis
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