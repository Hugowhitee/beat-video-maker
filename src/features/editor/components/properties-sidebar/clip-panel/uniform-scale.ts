import type { TimelineItem, TextItem } from '@/types/timeline'
import type { CanvasSettings, ResolvedTransform, TransformProperties } from '@/types/transform'
import type { ItemKeyframes } from '@/types/keyframe'
import { resolveTransform, getSourceDimensions } from '@/features/editor/deps/composition-runtime'
import {
  resolveAnimatedTransform,
  resolveAnimatedTextItem,
  type AutoKeyframeOperation,
} from '@/features/editor/deps/keyframes'
import {
  buildGizmoTransformCommit,
  buildGizmoAnchorCommit,
  buildGroupScaledTextProperties,
  buildGroupTextScaleCommit,
} from '@/features/editor/deps/preview'

function getUniformScaleReferenceWidth(item: TimelineItem, canvas: CanvasSettings) {
  const source = getSourceDimensions(item) ?? canvas
  return source.width * Math.min(canvas.width / source.width, canvas.height / source.height)
}

export function getUniformScaleValue(
  items: TimelineItem[],
  canvas: CanvasSettings,
  transforms: ReadonlyMap<string, { width: number }>,
): number | 'mixed' {
  const values = items.map((item) => {
    const fittedWidth = getUniformScaleReferenceWidth(item, canvas)
    return Math.round(((transforms.get(item.id)?.width ?? fittedWidth) / fittedWidth) * 100)
  })
  return values.every((value) => value === values[0]) ? (values[0] ?? 100) : 'mixed'
}

function buildScaledTextPlan({
  item,
  lanes,
  canvas,
  currentFrame,
  current,
  next,
  scaleIsKeyframed,
}: {
  item: TextItem
  lanes: ItemKeyframes | undefined
  canvas: CanvasSettings
  currentFrame: number
  current: ResolvedTransform
  next: ResolvedTransform
  scaleIsKeyframed: boolean
}) {
  const animatedText = resolveAnimatedTextItem(item, lanes, currentFrame - item.from, canvas)
  const scaled = buildGroupScaledTextProperties(
    [animatedText],
    new Map([[item.id, current]]),
    new Map([[item.id, next]]),
  ).get(item.id)
  if (!scaled) return null
  return {
    preview: scaled,
    ...buildGroupTextScaleCommit(item, lanes, scaled, currentFrame, scaleIsKeyframed),
  }
}

function mergeBaseAnchorUpdates(
  transform: Partial<TransformProperties>,
  anchor: Partial<TransformProperties>,
) {
  const updates = { ...transform }
  for (const property of ['anchorX', 'anchorY'] as const) {
    if (property in anchor) updates[property] = anchor[property]
  }
  return updates
}

/** Uniform scale is relative to the runtime's contain-fit size, including authored text metrics. */
export function buildUniformScalePlan(
  items: TimelineItem[],
  canvas: CanvasSettings,
  keyframes: ReadonlyMap<string, ItemKeyframes | null>,
  currentFrame: number,
  percent: number,
) {
  const transforms = new Map<string, Partial<TransformProperties>>()
  const itemUpdates = new Map<string, Partial<TextItem>>()
  const autoKeyframeOperations: AutoKeyframeOperation[] = []
  const previewTransforms: Record<string, ResolvedTransform> = {}
  const previewProperties: Record<string, Partial<TextItem>> = {}
  for (const item of items) {
    const source = getSourceDimensions(item)
    const base = resolveTransform(item, canvas, source)
    const lanes = keyframes.get(item.id) ?? undefined
    const current = resolveAnimatedTransform(base, lanes, currentFrame - item.from)
    const width = (getUniformScaleReferenceWidth(item, canvas) * percent) / 100
    const factor = width / current.width
    if (!Number.isFinite(factor) || factor <= 0) continue
    const next = {
      ...current,
      width,
      height: current.height * factor,
      anchorX: current.anchorX * factor,
      anchorY: current.anchorY * factor,
    }
    previewTransforms[item.id] = next
    const commit = buildGizmoTransformCommit({
      item,
      itemKeyframes: lanes,
      transform: next,
      baseTransform: base,
      currentFrame,
    })
    // Scale includes the local pivot so an authored off-center anchor remains proportional.
    const anchorCommit = buildGizmoAnchorCommit({
      item,
      itemKeyframes: lanes,
      transform: next,
      currentFrame,
    })
    const baseUpdates = mergeBaseAnchorUpdates(
      commit.shouldUpdateBase ? commit.transformProps : {},
      anchorCommit.transformProps,
    )
    if (Object.keys(baseUpdates).length) transforms.set(item.id, baseUpdates)
    autoKeyframeOperations.push(...commit.autoOps)
    autoKeyframeOperations.push(
      ...anchorCommit.autoOps.filter((operation) =>
        ['anchor', 'anchorX', 'anchorY'].includes(operation.property),
      ),
    )
    if (item.type === 'text') {
      const textPlan = buildScaledTextPlan({
        item,
        lanes,
        canvas,
        currentFrame,
        current,
        next,
        scaleIsKeyframed: commit.autoOps.some((operation) =>
          ['scale', 'width', 'height'].includes(operation.property),
        ),
      })
      if (!textPlan) continue
      previewProperties[item.id] = textPlan.preview
      itemUpdates.set(item.id, textPlan.itemUpdates)
      autoKeyframeOperations.push(...textPlan.autoKeyframeOperations)
    }
  }
  return { transforms, itemUpdates, autoKeyframeOperations, previewTransforms, previewProperties }
}
