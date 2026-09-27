/**
 * Adapter exports for Beatvideo analysis used by Effects.
 * Keeps the effects feature independent from editor UI modules.
 */
export { useProjectStore } from '@/features/projects/stores/project-store'
export { resolveBeatvideoTimelineGrid } from '@/features/timeline/utils/beatvideo-timeline-grid'
export {
  projectAudioReactiveBeatsToItem,
  projectAudioReactiveTransientsToItem,
} from '@/shared/beatvideo/beat-reactive'
