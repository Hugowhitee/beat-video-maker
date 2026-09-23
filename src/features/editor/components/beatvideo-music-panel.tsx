import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, Crosshair, LocateFixed, Play, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  analyzeMusicMedia,
  resolveBeatvideoMusicGrid,
  type MusicAnalysisProgress,
} from '@/features/editor/deps/beatvideo-music'
import { useMediaLibraryStore } from '@/features/editor/deps/media-library'
import { updateStoredProject, useProjectStore } from '@/features/editor/deps/projects'
import { useTimelineSettingsStore } from '@/features/editor/deps/timeline-store'
import { usePlaybackStore } from '@/shared/state/playback'
import type { BeatvideoMusicAnalysis } from '@/types/beatvideo'

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

export function BeatvideoMusicPanel() {
  const mediaItems = useMediaLibraryStore((state) => state.mediaItems)
  const currentProject = useProjectStore((state) => state.currentProject)
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
  const [progress, setProgress] = useState<MusicAnalysisProgress | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [bpmDraft, setBpmDraft] = useState('')
  const abortRef = useRef<AbortController | null>(null)

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
    const grid = analysis ? resolveBeatvideoMusicGrid(analysis) : null
    setBpmDraft(grid?.bpm ? grid.bpm.toFixed(2).replace(/\.00$/, '') : '')
  }, [analysis])

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
        version: 1,
        mediaId: selectedMediaId,
        analyzedAt: Date.now(),
        musicMap: result.musicMap,
        detectedBarOneTime,
        barOneTime: detectedBarOneTime,
        barOneVerified: false,
        bpmOverride: null,
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

  const setBarOneAtPlayhead = useCallback(async () => {
    if (!analysis || fps <= 0) return
    await persistAnalysis({
      ...analysis,
      barOneTime: currentFrame / fps,
      barOneVerified: true,
    })
    toast.success('Bar 1 locked to playhead')
  }, [analysis, currentFrame, fps, persistAnalysis])

  const jumpToBarOne = useCallback(() => {
    if (!analysis?.barOneTime || fps <= 0) {
      if (analysis?.barOneTime === 0 && fps > 0) {
        usePlaybackStore.getState().setCurrentFrame(0)
      }
      return
    }
    usePlaybackStore
      .getState()
      .setCurrentFrame(Math.max(0, Math.round(analysis.barOneTime * fps)))
  }, [analysis, fps])

  const applyBpm = useCallback(async () => {
    if (!analysis) return
    const nextBpm = Number(bpmDraft)
    if (!Number.isFinite(nextBpm) || nextBpm < 40 || nextBpm > 300) {
      toast.error('Enter a BPM between 40 and 300')
      return
    }
    await persistAnalysis({
      ...analysis,
      bpmOverride: nextBpm,
    })
  }, [analysis, bpmDraft, persistAnalysis])

  const resetBpm = useCallback(async () => {
    if (!analysis) return
    await persistAnalysis({
      ...analysis,
      bpmOverride: null,
    })
  }, [analysis, persistAnalysis])

  const resolvedGrid = analysis ? resolveBeatvideoMusicGrid(analysis) : null
  const barCount = resolvedGrid?.beats.filter((beat) => beat.downbeat).length ?? 0

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="space-y-4">
        <div className="rounded-md border border-border bg-secondary/20 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <AudioLines className="h-4 w-4" />
            Musical grid
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            The FreeCut timeline owns playback and seeking. Beatvideo only adds fixed musical
            markers on that same time axis, so the grid cannot drift away from the waveform.
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
            <div className="rounded-md border border-dashed border-border p-3 text-[10px] leading-relaxed text-muted-foreground">
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
            {analyzing ? 'Analyzing beat…' : analysis ? 'Analyze / replace grid' : 'Analyze beat'}
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
                  style={{ width: `${Math.max(2, progress.overallProgress * 100)}%` }}
                />
              </div>
            </div>
          ) : null}
        </section>

        {analysis && resolvedGrid ? (
          <>
            <section className="grid grid-cols-3 gap-1.5">
              <div className="rounded-md border border-border bg-secondary/20 p-2">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">BPM</div>
                <div className="mt-1 font-mono text-sm text-foreground">
                  {resolvedGrid.bpm?.toFixed(2).replace(/\.00$/, '') ?? '—'}
                </div>
              </div>
              <div className="rounded-md border border-border bg-secondary/20 p-2">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Beats / bar</div>
                <div className="mt-1 font-mono text-sm text-foreground">
                  {resolvedGrid.beatsPerBar}
                </div>
              </div>
              <div className="rounded-md border border-border bg-secondary/20 p-2">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Bars</div>
                <div className="mt-1 font-mono text-sm text-foreground">{barCount}</div>
              </div>
            </section>

            <section className="space-y-2">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Tempo correction
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
                  aria-label="BPM correction"
                />
                <Button type="button" size="sm" variant="outline" onClick={() => void applyBpm()}>
                  Apply
                </Button>
                {analysis.bpmOverride !== null ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => void resetBpm()}
                    aria-label="Use detected BPM"
                    data-tooltip="Use detected BPM"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </section>

            <section className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Bar 1
                  </div>
                  <div className="mt-1 font-mono text-sm text-foreground">
                    {formatClock(analysis.barOneTime)}
                  </div>
                </div>
                <span
                  className={
                    analysis.barOneVerified
                      ? 'rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary'
                      : 'rounded bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground'
                  }
                >
                  {analysis.barOneVerified ? 'Verified' : 'Detected'}
                </span>
              </div>

              <Button
                type="button"
                size="sm"
                className="w-full justify-start"
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
                disabled={analysis.barOneTime === null}
                onClick={jumpToBarOne}
              >
                <Play className="h-3.5 w-3.5" />
                Go to bar 1
              </Button>
            </section>

            <section className="space-y-1.5 rounded-md border border-border/80 bg-background/30 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground">
                <LocateFixed className="h-3.5 w-3.5" />
                Timeline reading
              </div>
              <div className="text-[10px] leading-relaxed text-muted-foreground">
                Playhead = playback. Thin lines = beats. Strong numbered lines = bars. The
                emphasized <strong className="text-foreground">1</strong> is the current bar-1
                anchor. Click or scrub the normal timeline ruler to seek.
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}
