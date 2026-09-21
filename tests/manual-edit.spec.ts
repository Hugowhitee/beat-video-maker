import { expect, test } from '@playwright/test';
import {
  replaceSegmentSource,
  setCutTransition,
  setSegmentLocked,
  slideCut,
  slipSegmentSource,
  snapTimeToMusic,
  splitSegmentAt,
} from '../src/features/auto-edit/manualEdit';
import type {
  ClipMap,
  EditPlan,
  MusicMap,
} from '../src/features/auto-edit/types';

function clips(): ClipMap {
  return {
    sources: [
      {
        id: 'source-a',
        name: 'A.mp4',
        duration: 60,
        shots: [
          {
            id: 'shot-a',
            sourceId: 'source-a',
            start: 0,
            end: 20,
            motion: 0.2,
            quality: 0.9,
            boundaryKind: 'source-start',
            boundaryConfidence: 1,
          },
          {
            id: 'shot-b',
            sourceId: 'source-a',
            start: 20,
            end: 40,
            motion: 0.55,
            quality: 0.9,
            boundaryKind: 'hard-cut',
            boundaryConfidence: 1,
          },
          {
            id: 'shot-c',
            sourceId: 'source-a',
            start: 40,
            end: 60,
            motion: 0.85,
            quality: 0.95,
            boundaryKind: 'hard-cut',
            boundaryConfidence: 1,
          },
        ],
      },
    ],
  };
}

function loopPlan(): EditPlan {
  return {
    mode: 'loop',
    duration: 16,
    warnings: [],
    segments: [
      {
        id: 's1',
        timelineStart: 0,
        timelineEnd: 4,
        sourceId: 'source-a',
        shotId: 'shot-a',
        sourceStart: 2,
        sourceEnd: 6,
        reason: 'generated',
        motifId: 'motif-1',
        motifSlot: 'slot-1',
      },
      {
        id: 's2',
        timelineStart: 4,
        timelineEnd: 8,
        sourceId: 'source-a',
        shotId: 'shot-b',
        sourceStart: 22,
        sourceEnd: 26,
        reason: 'generated',
        motifId: 'motif-1',
        motifSlot: 'slot-2',
      },
      {
        id: 's3',
        timelineStart: 8,
        timelineEnd: 12,
        sourceId: 'source-a',
        shotId: 'shot-a',
        sourceStart: 2,
        sourceEnd: 6,
        reason: 'generated',
        motifId: 'motif-1',
        motifSlot: 'slot-1',
      },
      {
        id: 's4',
        timelineStart: 12,
        timelineEnd: 16,
        sourceId: 'source-a',
        shotId: 'shot-b',
        sourceStart: 22,
        sourceEnd: 26,
        reason: 'generated',
        motifId: 'motif-1',
        motifSlot: 'slot-2',
      },
    ],
    transitions: [],
    motifs: [
      {
        id: 'motif-1',
        start: 0,
        duration: 8,
        bars: 4,
        segmentIds: ['s1', 's2'],
        transitionIds: [],
      },
    ],
  };
}

function music(): MusicMap {
  return {
    duration: 16,
    bpm: 120,
    beatsPerBar: 4,
    beats: Array.from({ length: 33 }, (_, index) => ({
      time: index * 0.5,
      index,
      downbeat: index % 4 === 0,
      strength: index % 4 === 0 ? 1 : 0.6,
    })),
    sections: [],
  };
}

test('drop/replace updates the linked loop slot without changing musical timing', () => {
  const before = loopPlan();
  const next = replaceSegmentSource(before, clips(), 's1', 'shot-c', 42);

  expect(next.segments.map((segment) => [
    segment.id,
    segment.timelineStart,
    segment.timelineEnd,
  ])).toEqual(before.segments.map((segment) => [
    segment.id,
    segment.timelineStart,
    segment.timelineEnd,
  ]));

  for (const id of ['s1', 's3']) {
    const segment = next.segments.find((candidate) => candidate.id === id)!;
    expect(segment.shotId).toBe('shot-c');
    expect(segment.sourceStart).toBe(42);
    expect(segment.sourceEnd).toBe(46);
    expect(segment.manualOverride).toBe(true);
  }

  expect(next.segments.find((segment) => segment.id === 's2')?.shotId).toBe('shot-b');
});

test('slip changes source time underneath a fixed linked musical slot', () => {
  const before = loopPlan();
  const next = slipSegmentSource(before, clips(), 's1', 3);

  for (const id of ['s1', 's3']) {
    const original = before.segments.find((segment) => segment.id === id)!;
    const segment = next.segments.find((candidate) => candidate.id === id)!;
    expect(segment.timelineStart).toBe(original.timelineStart);
    expect(segment.timelineEnd).toBe(original.timelineEnd);
    expect(segment.sourceStart).toBe(5);
    expect(segment.sourceEnd).toBe(9);
  }
});

test('cut splits the motif slot and propagates the same relative cut to repeats', () => {
  const withTransition = setCutTransition(loopPlan(), clips(), 's1', 's2', 'film-burn');
  const next = splitSegmentAt(withTransition, clips(), 's1', 2);

  expect(next.segments.map((segment) => segment.id)).toEqual([
    's1',
    's1-split',
    's2',
    's3',
    's3-split',
    's4',
  ]);

  expect(next.segments.find((segment) => segment.id === 's1')).toMatchObject({
    timelineStart: 0,
    timelineEnd: 2,
    sourceStart: 2,
    sourceEnd: 4,
    motifSlot: 'slot-1:a',
  });
  expect(next.segments.find((segment) => segment.id === 's1-split')).toMatchObject({
    timelineStart: 2,
    timelineEnd: 4,
    sourceStart: 4,
    sourceEnd: 6,
    motifSlot: 'slot-1:b',
  });
  expect(next.segments.find((segment) => segment.id === 's3-split')).toMatchObject({
    timelineStart: 10,
    timelineEnd: 12,
    sourceStart: 4,
    sourceEnd: 6,
    motifSlot: 'slot-1:b',
  });

  expect(next.motifs[0]?.segmentIds).toEqual(['s1', 's1-split', 's2']);
  expect(next.transitions.find((transition) => transition.rightSegmentId === 's2')?.leftSegmentId)
    .toBe('s1-split');
});

test('slide moves one musical cut across every linked repeat and preserves combined duration', () => {
  const withTransition = setCutTransition(loopPlan(), clips(), 's1', 's2', 'film-burn');
  const next = slideCut(withTransition, clips(), 's1', 's2', 5);

  expect(next.segments.find((segment) => segment.id === 's1')).toMatchObject({
    timelineStart: 0,
    timelineEnd: 5,
    sourceStart: 2,
    sourceEnd: 7,
  });
  expect(next.segments.find((segment) => segment.id === 's2')).toMatchObject({
    timelineStart: 5,
    timelineEnd: 8,
    sourceStart: 23,
    sourceEnd: 26,
  });
  expect(next.segments.find((segment) => segment.id === 's3')).toMatchObject({
    timelineStart: 8,
    timelineEnd: 13,
    sourceEnd: 7,
  });
  expect(next.segments.find((segment) => segment.id === 's4')).toMatchObject({
    timelineStart: 13,
    timelineEnd: 16,
    sourceStart: 23,
  });

  const firstPair = next.segments.filter((segment) => segment.timelineStart < 8);
  expect(firstPair.reduce((sum, segment) => sum + (segment.timelineEnd - segment.timelineStart), 0))
    .toBe(8);
  expect(next.transitions.find((transition) => transition.leftSegmentId === 's1')?.cutTime)
    .toBe(5);
  expect(next.transitions.find((transition) => transition.leftSegmentId === 's3')?.cutTime)
    .toBe(13);
});

test('film burn is a cut marker and clean cut removes the linked markers', () => {
  const added = setCutTransition(loopPlan(), clips(), 's1', 's2', 'film-burn', {
    duration: 0.3,
  });

  expect(added.transitions).toHaveLength(2);
  expect(added.transitions.map((transition) => transition.cutTime)).toEqual([4, 12]);
  expect(added.motifs[0]?.transitionIds).toHaveLength(1);

  const clean = setCutTransition(added, clips(), 's1', 's2', null);
  expect(clean.transitions).toHaveLength(0);
  expect(clean.motifs[0]?.transitionIds).toHaveLength(0);
});

test('lock state propagates across a linked motif slot', () => {
  const locked = setSegmentLocked(loopPlan(), 's2', true);

  expect(locked.segments.find((segment) => segment.id === 's2')?.locked).toBe(true);
  expect(locked.segments.find((segment) => segment.id === 's4')?.locked).toBe(true);
  expect(locked.segments.find((segment) => segment.id === 's1')?.locked).toBeUndefined();
});

test('musical snapping uses beats or downbeats instead of arbitrary seconds', () => {
  expect(snapTimeToMusic(music(), 4.24, 'beat')).toBe(4);
  expect(snapTimeToMusic(music(), 4.76, 'beat')).toBe(5);
  expect(snapTimeToMusic(music(), 5.2, 'downbeat')).toBe(6);
});
