export {
  createEditPlan,
  createSingleClipLoopPlan,
  offsetEditPlanTimeline,
} from '@/features/auto-edit/planner'
export {
  buildClipMapForMedia,
  type ClipMapBuildProgress,
} from '@/features/auto-edit/clip-map'
export {
  applyEditPlanSourceChangesToFreeCutTimeline,
  applyEditPlanToFreeCutTimeline,
} from '@/features/auto-edit/freecutTimeline'

export type { EditPace, SourceMixMode, TransitionProfile } from '@/features/auto-edit/types'
export {
  replaceSegmentSource,
  setSegmentLocked,
  slipSegmentSource,
} from '@/features/auto-edit/manualEdit'
export type {
  ClipMap,
  EditPlan,
  EditSegment,
  ClipShot,
} from '@/features/auto-edit/types'

export {
  BEATVIDEO_ANALYSIS_REVISION,
  shouldRefreshBeatvideoAnalysis,
} from '@/features/auto-edit/analysis-revision'
