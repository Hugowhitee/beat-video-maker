import type { BeatvideoMusicAnalysis } from '@/types/beatvideo'
import type { MusicAnalysisResult } from './musicAnalysis'
import {
  beatvideoMusicSourceFingerprintMatches,
  loadBeatvideoMusicEvidence,
  saveBeatvideoMusicEvidence,
  type BeatvideoMusicSourceMedia,
  type SavedBeatvideoMusicEvidence,
} from './deps/analysis-contract'

export interface ResolvedBeatvideoMusicEvidence {
  evidence: SavedBeatvideoMusicEvidence
  warnings: string[]
  source: 'cache' | 'analysis'
}

type EvidenceDependencies = {
  load: typeof loadBeatvideoMusicEvidence
  save: typeof saveBeatvideoMusicEvidence
}

const defaultEvidenceDependencies: EvidenceDependencies = {
  load: loadBeatvideoMusicEvidence,
  save: saveBeatvideoMusicEvidence,
}

function hasManualGridWork(analysis: BeatvideoMusicAnalysis): boolean {
  if (analysis.barOneVerified) return true
  if (analysis.bpmOverride !== null) return true
  if (analysis.gridMode === 'fixed') return true
  if ((analysis.correctionAnchors?.length ?? 0) > 0) return true
  return (
    analysis.detectedBarOneTime !== null &&
    analysis.barOneTime !== null &&
    Math.abs(analysis.barOneTime - analysis.detectedBarOneTime) > 1e-6
  )
}

export function mergeBeatvideoMusicEvidenceIntoProject(
  evidence: SavedBeatvideoMusicEvidence,
  previous: BeatvideoMusicAnalysis | null | undefined,
): BeatvideoMusicAnalysis {
  const preserveManual =
    previous?.mediaId === evidence.mediaId && hasManualGridWork(previous)

  return {
    version: 2,
    mediaId: evidence.mediaId,
    analyzedAt: evidence.analyzedAt,
    analysisRevision: evidence.analysisRevision,
    sourceFingerprint: { ...evidence.sourceFingerprint },
    musicMap: evidence.musicMap,
    detectedBarOneTime: evidence.detectedBarOneTime,
    barOneTime: preserveManual ? previous.barOneTime : evidence.detectedBarOneTime,
    barOneVerified: preserveManual ? previous.barOneVerified : false,
    bpmOverride: preserveManual ? previous.bpmOverride : null,
    gridMode: preserveManual ? previous.gridMode ?? 'detected' : 'detected',
    correctionAnchors: preserveManual ? [...(previous.correctionAnchors ?? [])] : [],
  }
}

export function beatvideoMusicProjectAnalysisMatchesSource(
  analysis: BeatvideoMusicAnalysis,
  media: BeatvideoMusicSourceMedia,
): boolean {
  if (!analysis.sourceFingerprint) return false
  return beatvideoMusicSourceFingerprintMatches(analysis.sourceFingerprint, media)
}

export async function loadCachedBeatvideoMusicEvidence(
  media: BeatvideoMusicSourceMedia,
  analysisRevision: number,
  dependencies: EvidenceDependencies = defaultEvidenceDependencies,
): Promise<SavedBeatvideoMusicEvidence | undefined> {
  return dependencies.load(media, analysisRevision)
}

export async function resolveBeatvideoMusicEvidence(
  params: {
    media: BeatvideoMusicSourceMedia
    analysisRevision: number
    force?: boolean
    analyze: () => Promise<MusicAnalysisResult>
  },
  dependencies: EvidenceDependencies = defaultEvidenceDependencies,
): Promise<ResolvedBeatvideoMusicEvidence> {
  if (!params.force) {
    const cached = await dependencies.load(params.media, params.analysisRevision)
    if (cached) {
      return { evidence: cached, warnings: [], source: 'cache' }
    }
  }

  const result = await params.analyze()
  if (result.musicMap.beats.length === 0) {
    throw new Error('No usable beats were detected. Try a clean music file or re-run analysis.')
  }

  const detectedBarOneTime =
    result.musicMap.beats.find((beat) => beat.downbeat)?.time ??
    result.musicMap.beats[0]?.time ??
    null

  const evidence = await dependencies.save({
    media: params.media,
    analysisRevision: params.analysisRevision,
    musicMap: result.musicMap,
    detectedBarOneTime,
  })

  return {
    evidence,
    warnings: result.warnings,
    source: 'analysis',
  }
}
