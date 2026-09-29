import type { BeatvideoMusicAnalysis } from '@/types/beatvideo'

/**
 * Bump when detector reconciliation changes enough that an untouched saved
 * detected grid should be refreshed automatically.
 */
export const BEATVIDEO_ANALYSIS_REVISION = 6

export function shouldRefreshBeatvideoAnalysis(
  analysis: BeatvideoMusicAnalysis | null | undefined,
): boolean {
  if (!analysis) return false
  if ((analysis.analysisRevision ?? 0) >= BEATVIDEO_ANALYSIS_REVISION) return false

  const mode =
    analysis.gridMode ?? (analysis.bpmOverride !== null ? 'fixed' : 'detected')
  if (mode !== 'detected') return false
  if (analysis.bpmOverride !== null) return false
  if (analysis.barOneVerified) return false
  if ((analysis.correctionAnchors?.length ?? 0) > 0) return false

  return true
}
