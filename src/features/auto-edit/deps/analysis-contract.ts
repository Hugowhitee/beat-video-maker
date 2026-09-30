/**
 * Auto-edit analysis adapter. Keep storage/detector dependencies behind the
 * feature boundary so the planner stays independent from infrastructure.
 */
export { SCENE_DETECTOR_VERSION } from '@/infrastructure/analysis/scene-detection-types'
export type { SceneCut } from '@/infrastructure/analysis/scene-detection-types'
export const importSceneDetection = () => import('@/infrastructure/analysis/scene-detection')
export { readAiOutput } from '@/infrastructure/storage/workspace-fs/ai-outputs'
export { saveScenes } from '@/infrastructure/storage/workspace-fs/scenes'
export {
  beatvideoMusicSourceFingerprintMatches,
  loadBeatvideoMusicEvidence,
  saveBeatvideoMusicEvidence,
  type BeatvideoMusicSourceMedia,
  type SavedBeatvideoMusicEvidence,
} from '@/infrastructure/storage/workspace-fs/music-analysis'
