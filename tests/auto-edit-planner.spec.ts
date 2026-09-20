import { expect, test } from '@playwright/test';
import { createEditPlan } from '../src/features/auto-edit/planner';
import type {
  ClipMap,
  MusicMap,
  MusicSection,
} from '../src/features/auto-edit/types';

function musicMap(sections: MusicSection[], duration = 32): MusicMap {
  const bpm = 120;
  const beatPeriod = 60 / bpm;
  const beats = Array.from(
    { length: Math.floor(duration / beatPeriod) + 1 },
    (_, index) => ({
      time: index * beatPeriod,
      index,
      downbeat: index % 4 === 0,
      strength: index % 4 === 0 ? 1 : 0.65,
    }),
  );

  return {
    duration,
    bpm,
    beatsPerBar: 4,
    beats,
    sections,
  };
}

function clipMap(): ClipMap {
  return {
    sources: [
      {
        id: 'video-a',
        name: 'A.mp4',
        duration: 40,
        shots: [
          {
            id: 'a-1',
            sourceId: 'video-a',
            start: 0,
            end: 10,
            motion: 0.18,
            quality: 0.95,
            boundaryKind: 'source-start',
            boundaryConfidence: 1,
          },
          {
            id: 'a-2',
            sourceId: 'video-a',
            start: 10,
            end: 20,
            motion: 0.55,
            quality: 0.9,
            boundaryKind: 'hard-cut',
            boundaryConfidence: 0.98,
          },
          {
            id: 'a-3',
            sourceId: 'video-a',
            start: 20,
            end: 30,
            motion: 0.92,
            quality: 0.92,
            boundaryKind: 'hard-cut',
            boundaryConfidence: 0.97,
          },
        ],
      },
      {
        id: 'video-b',
        name: 'B.mp4',
        duration: 30,
        shots: [
          {
            id: 'b-1',
            sourceId: 'video-b',
            start: 0,
            end: 10,
            motion: 0.3,
            quality: 0.88,
            boundaryKind: 'source-start',
            boundaryConfidence: 1,
          },
          {
            id: 'b-2',
            sourceId: 'video-b',
            start: 10,
            end: 20,
            motion: 0.78,
            quality: 0.94,
            boundaryKind: 'transition',
            boundaryConfidence: 0.86,
          },
          {
            id: 'b-3',
            sourceId: 'video-b',
            start: 20,
            end: 30,
            motion: 0.62,
            quality: 0.9,
            boundaryKind: 'hard-cut',
            boundaryConfidence: 0.96,
          },
        ],
      },
    ],
  };
}

function durations(plan: ReturnType<typeof createEditPlan>, start: number, end: number) {
  return plan.segments
    .filter((segment) => segment.timelineStart >= start && segment.timelineStart < end)
    .map((segment) => segment.timelineEnd - segment.timelineStart);
}

test('automatic cadence breathes in calm sections and tightens for a drop', () => {
  const music = musicMap([
    {
      id: 'intro',
      start: 0,
      end: 16,
      kind: 'intro',
      energy: 0.18,
      confidence: 0.95,
    },
    {
      id: 'drop',
      start: 16,
      end: 32,
      kind: 'drop',
      energy: 0.92,
      confidence: 0.95,
    },
  ]);

  const plan = createEditPlan(music, clipMap(), {
    mode: 'auto',
    transitionProfile: 'mixed',
    seed: 4,
  });

  const introDurations = durations(plan, 0, 16);
  const dropDurations = durations(plan, 16, 32);

  const introAverage = introDurations.reduce((sum, value) => sum + value, 0) / introDurations.length;
  const dropAverage = dropDurations.reduce((sum, value) => sum + value, 0) / dropDurations.length;

  expect(dropAverage).toBeLessThan(introAverage);
  expect(new Set(plan.segments.map((segment) => segment.timelineEnd - segment.timelineStart)).size)
    .toBeGreaterThan(3);

  const fourBarSeconds = 8;
  expect(plan.segments.some(
    (segment) => Math.abs((segment.timelineEnd - segment.timelineStart) - fourBarSeconds) > 0.1,
  )).toBeTruthy();
});

test('mixed transition profile still uses mostly clean cuts and reserves film burn for accents', () => {
  const music = musicMap([
    {
      id: 'intro',
      start: 0,
      end: 8,
      kind: 'intro',
      energy: 0.2,
      confidence: 0.9,
    },
    {
      id: 'drop',
      start: 8,
      end: 20,
      kind: 'drop',
      energy: 0.95,
      confidence: 0.95,
    },
    {
      id: 'verse',
      start: 20,
      end: 32,
      kind: 'verse',
      energy: 0.48,
      confidence: 0.9,
    },
  ]);

  const plan = createEditPlan(music, clipMap(), {
    mode: 'auto',
    transitionProfile: 'mixed',
    seed: 2,
  });

  const burns = plan.segments.filter((segment) => segment.transitionIn === 'film-burn');
  const cuts = plan.segments.filter((segment) => segment.transitionIn === 'cut');

  expect(burns).toHaveLength(1);
  expect(burns[0]?.timelineStart).toBeCloseTo(8, 5);
  expect(cuts.length).toBeGreaterThan(burns.length * 3);
});

test('loop mode creates one editable motif and repeats the exact cut/source pattern', () => {
  const music = musicMap([
    {
      id: 'verse',
      start: 0,
      end: 32,
      kind: 'verse',
      energy: 0.55,
      confidence: 0.9,
    },
  ]);

  const plan = createEditPlan(music, clipMap(), {
    mode: 'loop',
    loopBars: 4,
    transitionProfile: 'clean',
    seed: 8,
  });

  expect(plan.motifs).toHaveLength(1);
  expect(plan.motifs[0]?.bars).toBe(4);
  expect(plan.motifs[0]?.duration).toBeCloseTo(8, 5);

  const firstLoop = plan.segments.filter((segment) => segment.timelineStart < 8);
  const secondLoop = plan.segments.filter(
    (segment) => segment.timelineStart >= 8 && segment.timelineStart < 16,
  );

  expect(secondLoop).toHaveLength(firstLoop.length);
  expect(secondLoop.map((segment) => segment.shotId))
    .toEqual(firstLoop.map((segment) => segment.shotId));
  expect(secondLoop.map((segment) => segment.timelineEnd - segment.timelineStart))
    .toEqual(firstLoop.map((segment) => segment.timelineEnd - segment.timelineStart));
});

test('planned source ranges stay inside detected shots and avoid immediate reuse when alternatives fit', () => {
  const music = musicMap([
    {
      id: 'chorus',
      start: 0,
      end: 32,
      kind: 'chorus',
      energy: 0.72,
      confidence: 0.9,
    },
  ]);
  const clips = clipMap();

  const plan = createEditPlan(music, clips, {
    mode: 'guided',
    transitionProfile: 'clean',
    seed: 11,
  });

  const shots = new Map(
    clips.sources.flatMap((source) => source.shots).map((shot) => [shot.id, shot]),
  );

  plan.segments.forEach((segment, index) => {
    const shot = shots.get(segment.shotId);
    expect(shot).toBeDefined();
    expect(segment.sourceStart).toBeGreaterThanOrEqual(shot!.start - 1e-6);
    expect(segment.sourceEnd).toBeLessThanOrEqual(shot!.end + 1e-6);
    expect(segment.sourceEnd - segment.sourceStart)
      .toBeCloseTo(segment.timelineEnd - segment.timelineStart, 5);

    if (index > 0) {
      expect(segment.shotId).not.toBe(plan.segments[index - 1]?.shotId);
    }
  });
});


test('clean transition profile never inserts an effect transition', () => {
  const music = musicMap([
    {
      id: 'intro',
      start: 0,
      end: 8,
      kind: 'intro',
      energy: 0.15,
      confidence: 0.9,
    },
    {
      id: 'drop',
      start: 8,
      end: 20,
      kind: 'drop',
      energy: 0.96,
      confidence: 0.96,
    },
    {
      id: 'chorus',
      start: 20,
      end: 32,
      kind: 'chorus',
      energy: 0.82,
      confidence: 0.92,
    },
  ]);

  const plan = createEditPlan(music, clipMap(), {
    mode: 'auto',
    transitionProfile: 'clean',
    seed: 3,
  });

  expect(plan.segments.filter((segment) => segment.transitionIn === 'film-burn'))
    .toHaveLength(0);
  expect(plan.segments.slice(1).every((segment) => segment.transitionIn === 'cut'))
    .toBeTruthy();
});


test('intro and outro assets stay out of automatic footage selection', () => {
  const music = musicMap([
    {
      id: 'verse',
      start: 0,
      end: 32,
      kind: 'verse',
      energy: 0.55,
      confidence: 0.9,
    },
  ]);
  const clips = clipMap();
  clips.sources.push({
    id: 'intro-stinger',
    name: 'intro.mp4',
    duration: 4,
    role: 'intro',
    shots: [
      {
        id: 'intro-1',
        sourceId: 'intro-stinger',
        start: 0,
        end: 4,
        motion: 0.95,
        quality: 1,
        boundaryKind: 'source-start',
        boundaryConfidence: 1,
      },
    ],
  });

  const plan = createEditPlan(music, clips, {
    mode: 'auto',
    transitionProfile: 'mixed',
    seed: 6,
  });

  expect(plan.segments.some((segment) => segment.sourceId === 'intro-stinger'))
    .toBeFalsy();
});
