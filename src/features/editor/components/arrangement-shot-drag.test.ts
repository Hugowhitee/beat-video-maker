import { describe, expect, it } from 'vite-plus/test'
import {
  decodeArrangementShotDragPayload,
  encodeArrangementShotDragPayload,
  shotFitsArrangementSlot,
} from './arrangement-shot-drag'

describe('arrangement-shot-drag', () => {
  it('round-trips a detected shot drag payload', () => {
    expect(
      decodeArrangementShotDragPayload(
        encodeArrangementShotDragPayload('media-1:shot:3'),
      ),
    ).toEqual({
      type: 'beatvideo-arrangement-shot',
      shotId: 'media-1:shot:3',
    })
  })

  it('rejects unrelated or malformed drag data', () => {
    expect(decodeArrangementShotDragPayload('')).toBeNull()
    expect(decodeArrangementShotDragPayload('not-json')).toBeNull()
    expect(
      decodeArrangementShotDragPayload(
        JSON.stringify({ type: 'media-item', shotId: 'shot-1' }),
      ),
    ).toBeNull()
  })

  it('only allows shots long enough for the musical slot', () => {
    expect(
      shotFitsArrangementSlot({
        shotStart: 4,
        shotEnd: 6,
        slotDuration: 2,
      }),
    ).toBe(true)
    expect(
      shotFitsArrangementSlot({
        shotStart: 4,
        shotEnd: 5.5,
        slotDuration: 2,
      }),
    ).toBe(false)
  })
})
