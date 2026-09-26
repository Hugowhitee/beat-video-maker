import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AudioLines,
  Crosshair,
  Film,
  LocateFixed,
  Play,
  Repeat2,
  RotateCcw,
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
  getDroppedMediaDurationInFrames,
} from '@/features/editor/deps/timeline-contract'
import { usePlaybackStore } from '@/shared/state/playback'
import { useSelectionStore } from '@/shared/state/selection'
import {
  DEFAULT_PROJECT_HEIGHT,
  DEFAULT_PROJECT_WIDTH,
} from '@/shared/projects/defaults'
import { resolveProducerTagRepeatFrames } from '../utils/producer-tag'
import {
  applyEditPlanToFreeCutTimeline,
  createSingleClipLoopPlan,
} from '@/features/editor/deps/auto-edit-contract'
import type {
  BeatvideoGridCorrectionAnchor,
  BeatvideoGridMode,
  BeatvideoMusicAnalysis,
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
  const [progress, setProgress] = useState<MusicAnalysisProgress | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [bpmDraft, setBpmDraft] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const timelineGrid = useMemo(
    () =>
      analysis
        ? resolveBeatvideoTimelineGrid(analysis, items, fps)
        : null,
    [analysis, fps, items],
  )
  const effectiveAnalysis = timelineGrid?.analysis ?? analysis
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
    const preferred = analysis?.mediaId
    if (preferred && candidates.some((media) => media.id === preferred)) {
      setSelectedMediaId(preferred)
      return
    }
    if (!candidates.some((media) => media.id === selectedMediaId)) {
      setSelectedMediaId(candidates[0]?.id ?? '')
    }
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
    const bpm =
      effectiveAnalysis?.bpmOverride ??
      effectiveAnalysis?.musicMap.bpm ??
      null
    setBpmDraft(bpm ? bpm.toFixed(2).replace(/\.00$/, '') : '')
  }, [effectiveAnalysis])

  useEffect(
    () => () => {
      abortRef.current?.abort()
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
      const result = await analyzeMusicMedia(selectedMediaId, {
        signal: controller.signal,
        onProgress: setProgress,
      })
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
  }, [analyzing, currentProject, persistAnalysis, selectedMediaId])

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
      const tagDurationInFrames = getDroppedMediaDurationInFrames(media, 'audio', timeline.fps)
      let frames =
        mode === 'playhead'
          ? [Math.max(0, Math.round(usePlaybackStore.getState().currentFrame))]
          : timelineGrid
            ? resolveProducerTagRepeatFrames({
                beats: timelineGrid.grid.beats,
                fps: timeline.fps,
                everyBars: tagRepeatBars,
                startFrame: timelineGrid.placement.from,
                endFrame: timelineGrid.placement.from + timelineGrid.placement.durationInFrames,
                tagDurationInFrames,
              })
            : []

      if (mode === 'repeat' && !timelineGrid) {
        toast.error('Analyze and place the beat first to repeat tags on musical bars')
        return
      }

      const occupied = new Set(
        timeline.items
          .filter((item) => item.type === 'audio' && item.mediaId === media.id)
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

      const existingTagTrack = timeline.tracks.find(
        (track) => track.kind === 'audio' && track.name === 'Producer tags',
      )
      const maxOrder = timeline.tracks.reduce(
        (max, track) => Math.max(max, track.order ?? 0),
        0,
      )
      const tagTrack =
        existingTagTrack ??
        {
          ...createClassicTrack({
            tracks: timeline.tracks,
            kind: 'audio',
            order: maxOrder + 1,
          }),
          name: 'Producer tags',
        }
      const nextTracks = existingTagTrack
        ? timeline.tracks
        : [...timeline.tracks, tagTrack]
      const canvasWidth = currentProject?.metadata.width ?? DEFAULT_PROJECT_WIDTH
      const canvasHeight = currentProject?.metadata.height ?? DEFAULT_PROJECT_HEIGHT
      const tagItems = frames.flatMap((from) =>
        buildDroppedMediaTimelineItems({
          media,
          mediaId: media.id,
          mediaType: 'audio',
          label: `Producer tag: ${media.fileName}`,
          timelineFps: timeline.fps,
          blobUrl,
          canvasWidth,
          canvasHeight,
          placement: {
            primary: {
              trackId: tagTrack.id,
              from,
              durationInFrames: tagDurationInFrames,
            },
          },
        }),
      )

      if (existingTagTrack) {
        timeline.addItems(tagItems)
      } else {
        addItemsOnNewTracks(tagItems, nextTracks)
      }

      useSelectionStore.getState().setActiveTrack(tagTrack.id)
      useSelectionStore.getState().selectItems(tagItems.map((item) => item.id))
      toast.success(
        mode === 'repeat'
          ? `Placed ${tagItems.length} producer tags every ${tagRepeatBars} bars`
          : 'Producer tag added at playhead',
      )
    },
    [currentProject?.metadata.height, currentProject?.metadata.width, selectedTagMediaId, tagRepeatBars, timelineGrid],
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
    if (!effectiveAnalysis) return
    const nextBpm = Number(bpmDraft)
    if (!Number.isFinite(nextBpm) || nextBpm < 40 || nextBpm > 300) {
      toast.error('Enter a BPM between 40 and 300')
      return
    }
    await persistAnalysis({
      ...effectiveAnalysis,
      version: 2,
      bpmOverride: nextBpm,
      gridMode: 'fixed',
      correctionAnchors: effectiveAnalysis.correctionAnchors ?? [],
    })
  }, [bpmDraft, effectiveAnalysis, persistAnalysis])

  const resetToDetected = useCallback(async () => {
    if (!effectiveAnalysis) return
    await persistAnalysis({
      ...effectiveAnalysis,
      version: 2,
      bpmOverride: null,
      gridMode: 'detected',
      correctionAnchors: effectiveAnalysis.correctionAnchors ?? [],
    })
  }, [effectiveAnalysis, persistAnalysis])

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
    await persistAnalysis({
      ...effectiveAnalysis,
      version: 2,
      barOneTime: effectiveAnalysis.detectedBarOneTime,
      barOneVerified: false,
      bpmOverride: null,
      gridMode: 'detected',
      correctionAnchors: [],
    })
    toast.success('Beat grid reset to detected timing')
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
            Analysis stays attached to the music source. Move, trim, or retime the
            normal timeline clip and waveform, playhead, and beat grid stay on the
            same time axis.
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
              disabled={analyzing}
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
              Import an audio file, or a video with audio, in Media first.
            </div>
          )}

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
              : analysis
                ? 'Analyze / replace grid'
                : 'Analyze beat'}
          </Button>

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
        </section>

        {currentProject?.metadata.beatvideoMode === 'video' ? (
          <section className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <Film className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Footage loop
              </div>
            </div>

            {videoCandidates.length > 0 ? (
              <>
                <select
                  value={selectedLoopMediaId}
                  onChange={(event) => setSelectedLoopMediaId(event.target.value)}
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
                  className="w-full justify-start"
                  onClick={() => void loopVideoToBeat()}
                >
                  <Repeat2 className="h-3.5 w-3.5" />
                  Loop clip to beat
                </Button>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Repeats the full clip with clean cuts, trims only the final repeat,
                  fills the frame and keeps footage audio muted.
                </p>
              </>
            ) : (
              <div className="border-l-2 border-border pl-2 text-[10px] leading-relaxed text-muted-foreground">
                Import one short video clip in Media first.
              </div>
            )}
          </section>
        ) : null}

        <section className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Producer tag
            </div>
          </div>

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
                Place at playhead
              </Button>

              <div className="grid grid-cols-[1fr_auto] gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="justify-start"
                  disabled={!timelineGrid}
                  onClick={() => void insertProducerTags('repeat')}
                >
                  <Repeat2 className="h-3.5 w-3.5" />
                  Repeat across beat
                </Button>
                <select
                  value={tagRepeatBars}
                  onChange={(event) => setTagRepeatBars(Number(event.target.value))}
                  className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
                  aria-label="Producer tag repeat interval"
                >
                  <option value={8}>8 bars</option>
                  <option value={16}>16 bars</option>
                  <option value={32}>32 bars</option>
                </select>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Tags are normal audio clips on the Producer tags track. Move, trim,
                change volume, fade or delete them like any other clip.
              </p>
            </>
          ) : (
            <div className="border-l-2 border-border pl-2 text-[10px] leading-relaxed text-muted-foreground">
              Import a short producer-tag audio file in Media. The beat source itself is not used as a tag.
            </div>
          )}
        </section>

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

            <section className="space-y-2">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Grid type
              </div>
              <div className="grid grid-cols-2 gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={gridMode === 'detected' ? 'default' : 'outline'}
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

            {gridMode === 'fixed' ? (
              <section className="space-y-2">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Fixed tempo
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min={40}
                    max={300}
                    step={0.01}
                    value={bpmDraft}
                    onChange={(event) => setBpmDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void applyBpm()
                    }}
                    className="h-8 min-w-0 flex-1 rounded-md border border-input bg-secondary px-2 font-mono text-xs text-foreground"
                    aria-label="Fixed BPM"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void applyBpm()}
                  >
                    Apply
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => void resetToDetected()}
                    aria-label="Use detected timing"
                    data-tooltip="Use detected timing"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </section>
            ) : null}

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
          </>
        ) : null}
      </div>
    </div>
  )
}
