export const ARRANGEMENT_SHOT_DRAG_MIME =
  'application/x-beatvideo-arrangement-shot'

export interface ArrangementShotDragPayload {
  type: 'beatvideo-arrangement-shot'
  shotId: string
}

export function encodeArrangementShotDragPayload(shotId: string): string {
  return JSON.stringify({
    type: 'beatvideo-arrangement-shot',
    shotId,
  } satisfies ArrangementShotDragPayload)
}

export function decodeArrangementShotDragPayload(
  raw: string,
): ArrangementShotDragPayload | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<ArrangementShotDragPayload>
    if (
      parsed.type !== 'beatvideo-arrangement-shot' ||
      typeof parsed.shotId !== 'string' ||
      parsed.shotId.length === 0
    ) {
      return null
    }
    return {
      type: 'beatvideo-arrangement-shot',
      shotId: parsed.shotId,
    }
  } catch {
    return null
  }
}

export function shotFitsArrangementSlot(params: {
  shotStart: number
  shotEnd: number
  slotDuration: number
}): boolean {
  const shotDuration = params.shotEnd - params.shotStart
  return (
    Number.isFinite(shotDuration) &&
    Number.isFinite(params.slotDuration) &&
    params.slotDuration > 0 &&
    shotDuration + 1e-6 >= params.slotDuration
  )
}
