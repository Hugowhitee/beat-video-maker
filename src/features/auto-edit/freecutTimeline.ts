import type { MediaMetadata } from '@/types/storage'
import type { TimelineItem, TimelineTrack } from '@/types/timeline'
import type { TransitionPresentation } from '@/types/transition'
import { DEFAULT_PROJECT_HEIGHT, DEFAULT_PROJECT_WIDTH } from '@/shared/projects/defaults'
import type { EditPlan, EditTransition } from './types'
import {
  DEFAULT_TRACK_HEIGHT,
  buildMediaTimelineItems,
  canAddTransition,
  createClassicTrack,
  execute,
  getMediaType,
  getTrackKind,
  resolveMediaUrl,
  useItemsStore,
  useMediaLibraryStore,
  useProjectStore,
  useTimelineSettingsStore,
  useTransitionsStore,
} from './deps/freecut-contract'

const FALLBACK_SOURCE_FPS = 30

type EditSourceMedia = Pick<
  MediaMetadata,
  'duration' | 'fps' | 'width' | 'height' | 'mimeType' | 'fileName'
>

export interface ResolvedEditSource {
  sourceId: string
  mediaId: string
  media: EditSourceMedia
  blobUrl: string
  thumbnailUrl?: string
}

export interface EditPlanTimelineDraftOptions {
  projectFps: number
  canvasWidth: number
  canvasHeight: number
  existingTracks: TimelineTrack[]
  existingItems: TimelineItem[]
  preferredVideoTrackId?: string
}

export interface EditPlanTimelineTransitionDraft {
  sourceTransitionId: string
  leftItemId: string
  rightItemId: string
  durationInFrames: number
  alignment: number
  presentation: TransitionPresentation
}

export interface EditPlanTimelineDraft {
  targetVideoTrackId: string
  tracks: TimelineTrack[]
  items: TimelineItem[]
  transitions: EditPlanTimelineTransitionDraft[]
  itemIdBySegmentId: Record<string, string>
  warnings: string[]
}

export interface ApplyEditPlanOptions {
  preferredVideoTrackId?: string
  sourceMediaIds?: Record<string, string>
}

export interface ApplyEditPlanResult {
  targetVideoTrackId: string
  itemIds: string[]
  transitionIds: string[]
  itemIdBySegmentId: Record<string, string>
  warnings: string[]
}

function secondsToFrame(seconds: number, fps: number) {
  return Math.max(0, Math.round(seconds * fps))
}

function segmentFrameRange(
  segment: EditPlan['segments'][number],
  projectFps: number,
) {
  const from = secondsToFrame(segment.timelineStart, projectFps)
  const end = Math.max(from + 1, secondsToFrame(segment.timelineEnd, projectFps))
  return { from, end, durationInFrames: end - from }
}

function sourceFrameRange(
  segment: EditPlan['segments'][number],
  sourceFps: number,
) {
  const sourceStart = secondsToFrame(segment.sourceStart, sourceFps)
  const sourceEnd = Math.max(
    sourceStart + 1,
    secondsToFrame(segment.sourceEnd, sourceFps),
  )
  return { sourceStart, sourceEnd }
}

function itemOverlapsRange(item: TimelineItem, startFrame: number, endFrame: number) {
  const itemEnd = item.from + item.durationInFrames
  return item.from < endFrame && itemEnd > startFrame
}

function isUsableVideoTrack(
  track: TimelineTrack,
  items: TimelineItem[],
  startFrame: number,
  endFrame: number,
) {
  if (track.locked || track.isGroup || getTrackKind(track) !== 'video') return false
  return !items.some(
    (item) =>
      item.trackId === track.id
      && itemOverlapsRange(item, startFrame, endFrame),
  )
}

function resolveTargetVideoTrack(params: {
  tracks: TimelineTrack[]
  items: TimelineItem[]
  preferredVideoTrackId?: string
  startFrame: number
  endFrame: number
}) {
  const { tracks, items, preferredVideoTrackId, startFrame, endFrame } = params
  const preferred = preferredVideoTrackId
    ? tracks.find((track) => track.id === preferredVideoTrackId)
    : undefined

  if (
    preferred
    && isUsableVideoTrack(preferred, items, startFrame, endFrame)
  ) {
    return { tracks, trackId: preferred.id }
  }

  const existing = [...tracks]
    .filter((track) => isUsableVideoTrack(track, items, startFrame, endFrame))
    .sort((left, right) => right.order - left.order)[0]

  if (existing) {
    return { tracks, trackId: existing.id }
  }

  const topVideoOrder = [...tracks]
    .filter((track) => getTrackKind(track) === 'video')
    .sort((left, right) => left.order - right.order)[0]?.order
  const topOrder = [...tracks].sort((left, right) => left.order - right.order)[0]?.order ?? 0
  const createdTrack = createClassicTrack({
    tracks,
    kind: 'video',
    order: (topVideoOrder ?? topOrder) - 1,
    height: DEFAULT_TRACK_HEIGHT,
  })

  return {
    tracks: [...tracks, createdTrack],
    trackId: createdTrack.id,
  }
}

function transitionPresentation(transition: EditTransition): TransitionPresentation {
  if (transition.kind === 'film-burn') return 'lightLeakBurn'
  return 'fade'
}

function resolvePlanRange(plan: EditPlan, projectFps: number) {
  if (plan.segments.length === 0) {
    throw new Error('Cannot apply an empty Beatvideo edit plan.')
  }

  const ranges = plan.segments.map((segment) => segmentFrameRange(segment, projectFps))
  return {
    startFrame: Math.min(...ranges.map((range) => range.from)),
    endFrame: Math.max(...ranges.map((range) => range.end)),
  }
}

export function buildEditPlanTimelineDraft(
  plan: EditPlan,
  sources: ResolvedEditSource[],
  options: EditPlanTimelineDraftOptions,
): EditPlanTimelineDraft {
  const {
    projectFps,
    canvasWidth,
    canvasHeight,
    existingTracks,
    existingItems,
    preferredVideoTrackId,
  } = options

  if (!Number.isFinite(projectFps) || projectFps <= 0) {
    throw new Error('Project FPS must be positive before applying an edit plan.')
  }

  const sourceById = new Map(sources.map((source) => [source.sourceId, source]))
  const { startFrame, endFrame } = resolvePlanRange(plan, projectFps)
  const target = resolveTargetVideoTrack({
    tracks: existingTracks,
    items: existingItems,
    preferredVideoTrackId,
    startFrame,
    endFrame,
  })

  const items: TimelineItem[] = []
  const itemIdBySegmentId: Record<string, string> = {}
  const warnings = [...plan.warnings]

  for (const segment of [...plan.segments].sort(
    (left, right) => left.timelineStart - right.timelineStart,
  )) {
    const source = sourceById.get(segment.sourceId)
    if (!source) {
      throw new Error(`No FreeCut media binding exists for source "${segment.sourceId}".`)
    }

    const mediaType = getMediaType(source.media.mimeType)
    if (mediaType !== 'video') {
      throw new Error(
        `Beatvideo video edits require video media; source "${segment.sourceId}" resolved to ${mediaType}.`,
      )
    }

    const sourceFps = source.media.fps || FALLBACK_SOURCE_FPS
    const timelineRange = segmentFrameRange(segment, projectFps)
    const sourceRange = sourceFrameRange(segment, sourceFps)
    const built = buildMediaTimelineItems({
      media: source.media,
      mediaId: source.mediaId,
      mediaType: 'video',
      label: source.media.fileName,
      projectFps,
      blobUrl: source.blobUrl,
      thumbnailUrl: source.thumbnailUrl,
      canvasWidth,
      canvasHeight,
      sourceStart: sourceRange.sourceStart,
      sourceEnd: sourceRange.sourceEnd,
      fallbackSourceFps: FALLBACK_SOURCE_FPS,
      placements: {
        primary: {
          trackId: target.trackId,
          from: timelineRange.from,
          durationInFrames: timelineRange.durationInFrames,
        },
      },
      linkVideoAudio: false,
      createLinkedGroupId: false,
    })

    const item = built[0]
    if (!item || item.type !== 'video') {
      throw new Error(`Failed to materialize edit segment "${segment.id}" as video.`)
    }

    items.push(item)
    itemIdBySegmentId[segment.id] = item.id
  }

  const transitions: EditPlanTimelineTransitionDraft[] = []
  for (const transition of plan.transitions) {
    const leftItemId = itemIdBySegmentId[transition.leftSegmentId]
    const rightItemId = itemIdBySegmentId[transition.rightSegmentId]
    if (!leftItemId || !rightItemId) {
      warnings.push(
        `Skipped transition ${transition.id}: one or both segment items are missing.`,
      )
      continue
    }

    transitions.push({
      sourceTransitionId: transition.id,
      leftItemId,
      rightItemId,
      durationInFrames: Math.max(
        1,
        secondsToFrame(transition.duration, projectFps),
      ),
      alignment: Math.max(0, Math.min(1, transition.alignment)),
      presentation: transitionPresentation(transition),
    })
  }

  return {
    targetVideoTrackId: target.trackId,
    tracks: target.tracks,
    items,
    transitions,
    itemIdBySegmentId,
    warnings,
  }
}

async function resolveEditSources(
  plan: EditPlan,
  sourceMediaIds: Record<string, string> | undefined,
): Promise<ResolvedEditSource[]> {
  const sourceIds = Array.from(new Set(plan.segments.map((segment) => segment.sourceId)))
  const mediaById = useMediaLibraryStore.getState().mediaById

  return Promise.all(
    sourceIds.map(async (sourceId) => {
      const mediaId = sourceMediaIds?.[sourceId] ?? sourceId
      const media = mediaById[mediaId]
      if (!media) {
        throw new Error(
          `Beatvideo source "${sourceId}" is not available in the FreeCut media library.`,
        )
      }

      if (getMediaType(media.mimeType) !== 'video') {
        throw new Error(
          `Beatvideo source "${sourceId}" must resolve to video media.`,
        )
      }

      const blobUrl = await resolveMediaUrl(mediaId)
      if (!blobUrl) {
        throw new Error(
          `Beatvideo source "${sourceId}" could not be resolved for playback.`,
        )
      }

      return {
        sourceId,
        mediaId,
        media,
        blobUrl,
      }
    }),
  )
}

export async function applyEditPlanToFreeCutTimeline(
  plan: EditPlan,
  options: ApplyEditPlanOptions = {},
): Promise<ApplyEditPlanResult> {
  const projectFps = useTimelineSettingsStore.getState().fps
  const currentProject = useProjectStore.getState().currentProject
  const canvasWidth = currentProject?.metadata.width ?? DEFAULT_PROJECT_WIDTH
  const canvasHeight = currentProject?.metadata.height ?? DEFAULT_PROJECT_HEIGHT
  const resolvedSources = await resolveEditSources(plan, options.sourceMediaIds)
  const itemState = useItemsStore.getState()

  const draft = buildEditPlanTimelineDraft(plan, resolvedSources, {
    projectFps,
    canvasWidth,
    canvasHeight,
    existingTracks: itemState.tracks,
    existingItems: itemState.items,
    preferredVideoTrackId: options.preferredVideoTrackId,
  })

  const draftItemsById = new Map(draft.items.map((item) => [item.id, item]))
  const acceptedTransitions: EditPlanTimelineTransitionDraft[] = []
  const warnings = [...draft.warnings]

  for (const transition of draft.transitions) {
    const left = draftItemsById.get(transition.leftItemId)
    const right = draftItemsById.get(transition.rightItemId)
    if (!left || !right) continue

    const validation = canAddTransition(
      left,
      right,
      transition.durationInFrames,
      transition.alignment,
      projectFps,
    )
    if (!validation.canAdd) {
      warnings.push(
        `Skipped transition ${transition.sourceTransitionId}: ${validation.reason ?? 'invalid FreeCut transition'}.`,
      )
      continue
    }
    acceptedTransitions.push(transition)
  }

  const transitionIds: string[] = []
  execute(
    'APPLY_BEATVIDEO_EDIT_PLAN',
    () => {
      const itemsStore = useItemsStore.getState()
      itemsStore.setTracks(draft.tracks)
      itemsStore._addItems(draft.items)

      const transitionsStore = useTransitionsStore.getState()
      for (const transition of acceptedTransitions) {
        const id = transitionsStore._addTransition(
          transition.leftItemId,
          transition.rightItemId,
          draft.targetVideoTrackId,
          'crossfade',
          transition.durationInFrames,
          transition.presentation,
          undefined,
          transition.alignment,
        )
        transitionIds.push(id)
      }

      useTimelineSettingsStore.getState().markDirty()
    },
    {
      mode: plan.mode,
      segmentCount: draft.items.length,
      transitionCount: acceptedTransitions.length,
      targetVideoTrackId: draft.targetVideoTrackId,
    },
  )

  return {
    targetVideoTrackId: draft.targetVideoTrackId,
    itemIds: draft.items.map((item) => item.id),
    transitionIds,
    itemIdBySegmentId: draft.itemIdBySegmentId,
    warnings,
  }
}
