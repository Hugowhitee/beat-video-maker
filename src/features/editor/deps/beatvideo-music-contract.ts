export {
  analyzeMusicMedia,
  type MusicAnalysisProgress,
} from '@/features/auto-edit/musicAnalysis'
export {
  adoptBeatvideoMusicProjectEvidence,
  beatvideoMusicProjectAnalysisMatchesSource,
  loadCachedBeatvideoMusicEvidence,
  mergeBeatvideoMusicEvidenceIntoProject,
  resolveBeatvideoMusicEvidence,
} from '@/features/auto-edit/music-analysis-cache'
export {
  getBeatvideoGridMode,
  resolveBeatvideoMusicGrid,
} from '@/shared/beatvideo/music-grid'
export {
  findBeatvideoMusicPlacement,
  normalizeBeatvideoAnalysisForPlacement,
  resolveBeatvideoTimelineGrid,
} from '@/features/timeline/utils/beatvideo-timeline-grid'
export {
  sourceSecondsToTimelineFrame,
  timelineFrameToSourceSeconds,
} from '@/features/timeline/utils/media-item-frames'

export {
  projectAudioReactiveBeatsToItem,
  projectAudioReactiveTransientsToItem,
} from '@/shared/beatvideo/beat-reactive'
