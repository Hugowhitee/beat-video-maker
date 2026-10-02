import {
  createDefaultShapeItem,
  createOverlayLayerTrack,
  createTextTemplateItem,
  getDefaultGeneratedLayerDurationInFrames,
} from '@/features/editor/deps/timeline-utils'
import { useTimelineStore } from '@/features/editor/deps/timeline-store'
import { useProjectStore } from '@/features/editor/deps/projects'
import { useMediaLibraryStore } from '@/features/editor/deps/media-library'
import { usePlaybackStore } from '@/shared/state/playback'
import { useSelectionStore } from '@/shared/state/selection'
import {
  DEFAULT_PROJECT_HEIGHT,
  DEFAULT_PROJECT_WIDTH,
} from '@/shared/projects/defaults'

export type StudioVisualQuickAddKind = 'video' | 'image'

export async function importStudioVisualMedia(
  kind: StudioVisualQuickAddKind,
): Promise<{ importedCount: number; matchingCount: number }> {
  const imported = await useMediaLibraryStore.getState().importMedia({ storageMode: 'copy' })
  const prefix = kind === 'video' ? 'video/' : 'image/'
  return {
    importedCount: imported.length,
    matchingCount: imported.filter((media) => media.mimeType.startsWith(prefix)).length,
  }
}

function resolveGeneratedLayerPlacement() {
  const timeline = useTimelineStore.getState()
  const selection = useSelectionStore.getState()
  const project = useProjectStore.getState().currentProject
  const newTrack = createOverlayLayerTrack({
    tracks: timeline.tracks,
    activeTrackId: selection.activeTrackId,
  })
  if (!newTrack) return null

  return {
    timeline,
    selection,
    newTrack,
    from: Math.max(0, usePlaybackStore.getState().currentFrame),
    durationInFrames: getDefaultGeneratedLayerDurationInFrames(timeline.fps),
    canvasWidth: project?.metadata.width ?? DEFAULT_PROJECT_WIDTH,
    canvasHeight: project?.metadata.height ?? DEFAULT_PROJECT_HEIGHT,
  }
}

export function addStudioTextLayer(): boolean {
  const placement = resolveGeneratedLayerPlacement()
  if (!placement) return false

  const item = createTextTemplateItem({
    placement: {
      trackId: placement.newTrack.trackId,
      from: placement.from,
      durationInFrames: placement.durationInFrames,
      canvasWidth: placement.canvasWidth,
      canvasHeight: placement.canvasHeight,
      fps: placement.timeline.fps,
    },
    label: 'Text',
    text: 'Text',
  })

  placement.timeline.addItemOnNewTrack(item, placement.newTrack.tracks)
  placement.selection.setActiveTrack(placement.newTrack.trackId)
  placement.selection.selectItems([item.id])
  return true
}

export function addStudioGraphicLayer(): boolean {
  const placement = resolveGeneratedLayerPlacement()
  if (!placement) return false

  const item = createDefaultShapeItem({
    trackId: placement.newTrack.trackId,
    from: placement.from,
    durationInFrames: placement.durationInFrames,
    canvasWidth: placement.canvasWidth,
    canvasHeight: placement.canvasHeight,
    shapeType: 'rectangle',
  })

  placement.timeline.addItemOnNewTrack(item, placement.newTrack.tracks)
  placement.selection.setActiveTrack(placement.newTrack.trackId)
  placement.selection.selectItems([item.id])
  return true
}
