// @vitest-environment node

import { expect, test } from 'vite-plus/test'
import { createEditPlan, createSingleClipLoopPlan } from './planner';
import type {
  ClipMap,
  MusicMap,
  MusicSection,
} from './types';

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
    transitionProfile: 'accent',
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

test('accent transition profile still uses mostly clean cuts and reserves effects for strong accents', () => {
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
    transitionProfile: 'accent',
    seed: 2,
  });

  const burns = plan.transitions.filter((transition) => transition.kind === 'film-burn');
  const cleanCutCount = Math.max(0, plan.segments.length - 1 - plan.transitions.length);

  expect(burns).toHaveLength(1);
  expect(burns[0]?.cutTime).toBeCloseTo(8, 5);
  expect(cleanCutCount).toBeGreaterThan(burns.length * 3);
  expect(burns[0]?.duration).toBeGreaterThanOrEqual(0.22);
  expect(burns[0]?.duration).toBeLessThanOrEqual(0.42);
  expect(burns[0]?.alignment).toBe(0.5);
});

test('accent transition profile stays sparse and varies the treatment', () => {
  const music = musicMap([
    {
      id: 'intro',
      start: 0,
      end: 8,
      kind: 'intro',
      energy: 0.2,
      confidence: 0.95,
    },
    {
      id: 'drop-a',
      start: 8,
      end: 16,
      kind: 'drop',
      energy: 0.95,
      confidence: 0.98,
    },
    {
      id: 'verse',
      start: 16,
      end: 24,
      kind: 'verse',
      energy: 0.42,
      confidence: 0.92,
    },
    {
      id: 'drop-b',
      start: 24,
      end: 32,
      kind: 'drop',
      energy: 0.93,
      confidence: 0.98,
    },
  ])

  const plan = createEditPlan(music, clipMap(), {
    mode: 'auto',
    transitionProfile: 'accent',
    seed: 2,
  })

  expect(plan.transitions.length).toBeGreaterThanOrEqual(2)
  expect(plan.transitions[0]?.kind).toBe('film-burn')
  expect(plan.transitions[1]?.kind).toBe('film-gate')
  expect(plan.transitions.every((transition) => transition.duration <= 0.42)).toBe(true)
  expect(plan.segments.length - 1).toBeGreaterThan(plan.transitions.length * 3)
})

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
  expect(plan.motifs[0]?.transitionIds.every(
    (transitionId) => plan.transitions.some((transition) => transition.id === transitionId),
  )).toBeTruthy();
});

test('loop mode keeps reliable intro and outro outside the repeated body motif', () => {
  const music = musicMap([
    {
      id: 'intro',
      start: 0,
      end: 4,
      kind: 'intro',
      energy: 0.2,
      confidence: 0.92,
    },
    {
      id: 'body',
      start: 4,
      end: 24,
      kind: 'verse',
      energy: 0.55,
      confidence: 0.9,
    },
    {
      id: 'outro',
      start: 24,
      end: 32,
      kind: 'outro',
      energy: 0.18,
      confidence: 0.93,
    },
  ], 32)

  const plan = createEditPlan(music, clipMap(), {
    mode: 'loop',
    loopBars: 4,
    transitionProfile: 'clean',
    seed: 8,
  })

  expect(plan.motifs).toHaveLength(1)
  expect(plan.motifs[0]?.start).toBeCloseTo(4, 5)
  expect(plan.motifs[0]?.duration).toBeCloseTo(8, 5)

  const intro = plan.segments.filter((segment) => segment.timelineStart < 4)
  const body = plan.segments.filter(
    (segment) => segment.timelineStart >= 4 && segment.timelineStart < 24,
  )
  const outro = plan.segments.filter((segment) => segment.timelineStart >= 24)

  expect(intro.length).toBeGreaterThan(0)
  expect(outro.length).toBeGreaterThan(0)
  expect(intro.every((segment) => segment.motifId === undefined)).toBe(true)
  expect(outro.every((segment) => segment.motifId === undefined)).toBe(true)
  expect(body.every((segment) => segment.motifId === 'motif-1')).toBe(true)
  expect(plan.warnings).toContain('Reliable intro kept outside Loop A.')
  expect(plan.warnings).toContain('Reliable outro kept outside Loop A.')

  const firstBodyLoop = body.filter((segment) => segment.timelineStart < 12)
  const secondBodyLoop = body.filter(
    (segment) => segment.timelineStart >= 12 && segment.timelineStart < 20,
  )
  expect(secondBodyLoop.map((segment) => segment.shotId))
    .toEqual(firstBodyLoop.map((segment) => segment.shotId))
})

test('loop mode ignores low-confidence edge labels instead of inventing structure', () => {
  const music = musicMap([
    {
      id: 'intro',
      start: 0,
      end: 4,
      kind: 'intro',
      energy: 0.2,
      confidence: 0.3,
    },
    {
      id: 'body',
      start: 4,
      end: 28,
      kind: 'verse',
      energy: 0.55,
      confidence: 0.9,
    },
    {
      id: 'outro',
      start: 28,
      end: 32,
      kind: 'outro',
      energy: 0.18,
      confidence: 0.4,
    },
  ], 32)

  const plan = createEditPlan(music, clipMap(), {
    mode: 'loop',
    loopBars: 4,
    transitionProfile: 'clean',
    seed: 8,
  })

  expect(plan.motifs[0]?.start).toBe(0)
  expect(plan.segments.every((segment) => segment.motifId === 'motif-1')).toBe(true)
  expect(plan.warnings).toEqual([])
})

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


test('balanced source mix keeps enabled footage sources in rotation', () => {
  const music = musicMap([
    {
      id: 'verse',
      start: 0,
      end: 16,
      kind: 'verse',
      energy: 0.55,
      confidence: 0.9,
    },
  ], 16)

  const plan = createEditPlan(music, clipMap(), {
    mode: 'auto',
    sourceMix: 'balanced',
    transitionProfile: 'clean',
    seed: 3,
  })

  const counts = plan.segments.reduce<Record<string, number>>((result, segment) => {
    result[segment.sourceId] = (result[segment.sourceId] ?? 0) + 1
    return result
  }, {})

  expect(new Set(plan.segments.map((segment) => segment.sourceId)).size).toBe(2)
  expect(Math.abs((counts['video-a'] ?? 0) - (counts['video-b'] ?? 0))).toBeLessThanOrEqual(1)
  for (let index = 1; index < plan.segments.length; index += 1) {
    expect(plan.segments[index]?.sourceId).not.toBe(plan.segments[index - 1]?.sourceId)
  }
})

test('rotate source mix follows source order when eligible shots fit', () => {
  const music = musicMap([
    {
      id: 'drop',
      start: 0,
      end: 8,
      kind: 'drop',
      energy: 0.9,
      confidence: 0.95,
    },
  ], 8)

  const plan = createEditPlan(music, clipMap(), {
    mode: 'auto',
    sourceMix: 'rotate',
    pace: 'energetic',
    transitionProfile: 'clean',
    seed: 1,
  })

  expect(plan.segments.slice(0, 4).map((segment) => segment.sourceId)).toEqual([
    'video-a',
    'video-b',
    'video-a',
    'video-b',
  ])
})

test('weighted source mix respects explicit source preference', () => {
  const music = musicMap([
    {
      id: 'verse',
      start: 0,
      end: 16,
      kind: 'verse',
      energy: 0.55,
      confidence: 0.9,
    },
  ], 16)

  const plan = createEditPlan(music, clipMap(), {
    mode: 'auto',
    sourceMix: 'weighted',
    sourceWeights: {
      'video-a': 0.25,
      'video-b': 2,
    },
    transitionProfile: 'clean',
    seed: 5,
  })

  const sourceIds = plan.segments.map((segment) => segment.sourceId)
  expect(sourceIds.filter((sourceId) => sourceId === 'video-b').length)
    .toBeGreaterThan(sourceIds.filter((sourceId) => sourceId === 'video-a').length)
})

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

  expect(plan.transitions).toHaveLength(0);
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
    transitionProfile: 'accent',
    seed: 6,
  });

  expect(plan.segments.some((segment) => segment.sourceId === 'intro-stinger'))
    .toBeFalsy();
});


test('effect transitions are omitted when adjacent source shots have no hidden handles', () => {
  const music = musicMap([
    {
      id: 'intro',
      start: 0,
      end: 8,
      kind: 'intro',
      energy: 0.18,
      confidence: 0.95,
    },
    {
      id: 'drop',
      start: 8,
      end: 16,
      kind: 'drop',
      energy: 0.96,
      confidence: 0.98,
    },
  ], 16);

  const clips: ClipMap = {
    sources: [
      {
        id: 'tight-source',
        name: 'tight.mp4',
        duration: 24,
        shots: Array.from({ length: 6 }, (_, index) => ({
          id: `tight-${index + 1}`,
          sourceId: 'tight-source',
          start: index * 4,
          end: index * 4 + 4,
          motion: index < 2 ? 0.2 : 0.9,
          quality: 0.95,
          boundaryKind: index === 0 ? 'source-start' as const : 'hard-cut' as const,
          boundaryConfidence: 1,
        })),
      },
    ],
  };

  const plan = createEditPlan(music, clips, {
    mode: 'auto',
    transitionProfile: 'accent',
    seed: 1,
  });

  // The cut itself remains valid. We simply decline the Film Burn because a
  // transition needs hidden media on both sides of the cut.
  expect(plan.segments.some((segment) => Math.abs(segment.timelineStart - 8) < 1e-6))
    .toBeTruthy();
  expect(plan.transitions.filter((transition) => transition.kind === 'film-burn'))
    .toHaveLength(0);
});


test('single clip loop repeats the full source cleanly and trims only the final repeat', () => {
  const plan = createSingleClipLoopPlan({
    sourceId: 'clip-a',
    sourceDuration: 7.5,
    timelineStart: 2,
    timelineDuration: 20,
  })

  expect(plan.transitions).toHaveLength(0)
  expect(plan.segments.map((segment) => [
    segment.timelineStart,
    segment.timelineEnd,
    segment.sourceStart,
    segment.sourceEnd,
  ])).toEqual([
    [2, 9.5, 0, 7.5],
    [9.5, 17, 0, 7.5],
    [17, 22, 0, 5],
  ])
})


test('section boundaries never pull Auto Arrange cuts off the musical grid', () => {
  const music = musicMap([
    {
      id: 'verse-a',
      start: 0,
      end: 7.37,
      kind: 'verse',
      energy: 0.5,
      confidence: 0.9,
    },
    {
      id: 'chorus-b',
      start: 7.37,
      end: 16,
      kind: 'chorus',
      energy: 0.8,
      confidence: 0.9,
    },
  ], 16)

  const plan = createEditPlan(music, clipMap(), {
    mode: 'auto',
    pace: 'balanced',
    transitionProfile: 'clean',
    seed: 2,
  })

  const beatTimes = new Set(music.beats.map((beat) => beat.time.toFixed(6)))
  for (const segment of plan.segments.slice(0, -1)) {
    expect(beatTimes.has(segment.timelineEnd.toFixed(6))).toBe(true)
  }
  expect(plan.segments.some((segment) => Math.abs(segment.timelineEnd - 7.37) < 1e-6))
    .toBe(false)
})

test('Auto Arrange pace changes edit density without changing the grid source', () => {
  const music = musicMap([
    {
      id: 'drop',
      start: 0,
      end: 16,
      kind: 'drop',
      energy: 0.9,
      confidence: 0.95,
    },
  ], 16)

  const relaxed = createEditPlan(music, clipMap(), {
    mode: 'auto',
    pace: 'relaxed',
    transitionProfile: 'clean',
    seed: 1,
  })
  const energetic = createEditPlan(music, clipMap(), {
    mode: 'auto',
    pace: 'energetic',
    transitionProfile: 'clean',
    seed: 1,
  })

  expect(energetic.segments.length).toBeGreaterThan(relaxed.segments.length)

  const beatTimes = new Set(music.beats.map((beat) => beat.time.toFixed(6)))
  for (const plan of [relaxed, energetic]) {
    for (const segment of plan.segments.slice(0, -1)) {
      expect(beatTimes.has(segment.timelineEnd.toFixed(6))).toBe(true)
    }
  }
})

test('backbeat rhythm keeps every internal cut on a real beat and favors beats 2 and 4', () => {
  const music = musicMap([
    {
      id: 'drop',
      start: 0,
      end: 16,
      kind: 'drop',
      energy: 0.92,
      confidence: 0.96,
    },
  ], 16)

  const plan = createEditPlan(music, clipMap(), {
    mode: 'auto',
    pace: 'energetic',
    cutRhythm: 'backbeat',
    transitionProfile: 'clean',
    seed: 1,
  })

  const beatByTime = new Map(music.beats.map((beat) => [beat.time.toFixed(6), beat]))
  const internalCuts = plan.segments.slice(0, -1).map((segment) => segment.timelineEnd)
  expect(internalCuts.length).toBeGreaterThan(2)
  expect(internalCuts.every((time) => beatByTime.has(time.toFixed(6)))).toBe(true)

  const backbeatCuts = internalCuts.filter((time) => {
    const beat = beatByTime.get(time.toFixed(6))
    if (!beat) return false
    const position = (beat.index % music.beatsPerBar) + 1
    return position === 2 || position === 4
  })
  expect(backbeatCuts.length).toBeGreaterThan(0)
})

test('syncopated rhythm may use half-beat ands but never invents arbitrary cut times', () => {
  const music = musicMap([
    {
      id: 'drop',
      start: 0,
      end: 16,
      kind: 'drop',
      energy: 0.94,
      confidence: 0.97,
    },
  ], 16)

  const plan = createEditPlan(music, clipMap(), {
    mode: 'auto',
    pace: 'energetic',
    cutRhythm: 'syncopated',
    transitionProfile: 'clean',
    seed: 1,
  })

  const beatTimes = new Set(music.beats.map((beat) => beat.time.toFixed(6)))
  const allowed = new Set(beatTimes)
  for (let index = 0; index < music.beats.length - 1; index += 1) {
    const left = music.beats[index]!.time
    const right = music.beats[index + 1]!.time
    allowed.add((left + (right - left) / 2).toFixed(6))
  }

  const internalCuts = plan.segments.slice(0, -1).map((segment) => segment.timelineEnd)
  expect(internalCuts.every((time) => allowed.has(time.toFixed(6)))).toBe(true)
  expect(internalCuts.some((time) => !beatTimes.has(time.toFixed(6)))).toBe(true)
})

test('short source shots never force Auto Arrange to create an off-grid boundary', () => {
  const music = musicMap([
    {
      id: 'verse',
      start: 0,
      end: 4,
      kind: 'verse',
      energy: 0.5,
      confidence: 0.9,
    },
  ], 4)
  const clips = clipMap()
  for (const source of clips.sources) {
    source.shots = source.shots.map((shot, index) => ({
      ...shot,
      start: index,
      end: index + 0.2,
    }))
  }

  expect(() =>
    createEditPlan(music, clips, {
      mode: 'auto',
      cutRhythm: 'straight',
      transitionProfile: 'clean',
      seed: 1,
    }),
  ).toThrow(/musical grid point/i)
})

test('excluded shots are never selected by Auto Arrange', () => {
  const music = musicMap([
    {
      id: 'verse',
      start: 0,
      end: 16,
      kind: 'verse',
      energy: 0.5,
      confidence: 0.9,
    },
  ], 16)

  const baseline = createEditPlan(music, clipMap(), {
    mode: 'auto',
    transitionProfile: 'clean',
    seed: 1,
  })
  const excluded = baseline.segments[0]!.shotId

  const rebuilt = createEditPlan(music, clipMap(), {
    mode: 'auto',
    transitionProfile: 'clean',
    excludedShotIds: [excluded],
    seed: 1,
  })

  expect(rebuilt.segments.some((segment) => segment.shotId === excluded)).toBe(false)
})
