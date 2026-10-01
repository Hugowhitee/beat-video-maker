import type {
  ClipMap,
  ClipShot,
  EditMotif,
  EditPlan,
  EditPlannerOptions,
  EditSegment,
  EditTransition,
  MusicMap,
  SourceMixMode,
  MusicSection,
} from './types';

const EPSILON = 1e-6;
const EDGE_SECTION_CONFIDENCE = 0.65;
const EDGE_SECTION_TOLERANCE_SECONDS = 0.25;

type TimelineSlot = {
  start: number;
  end: number;
  section: MusicSection;
  beatSpan: number;
};

type PlannerContext = {
  music: MusicMap;
  shots: ClipShot[];
  sourceIds: string[];
  maxShotDuration: number;
  options: Required<EditPlannerOptions>;
};

const FALLBACK_SECTION: MusicSection = {
  id: 'unknown',
  start: 0,
  end: Number.POSITIVE_INFINITY,
  kind: 'unknown',
  energy: 0.5,
  confidence: 0,
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function sectionAt(music: MusicMap, time: number) {
  return music.sections.find(
    (section) => time >= section.start - EPSILON && time < section.end - EPSILON,
  ) ?? { ...FALLBACK_SECTION, start: time, end: music.duration };
}

function sectionIntensity(section: MusicSection) {
  const bias = {
    intro: -0.18,
    verse: -0.05,
    chorus: 0.1,
    break: -0.2,
    build: 0.12,
    drop: 0.28,
    outro: -0.16,
    unknown: 0,
  }[section.kind];

  return clamp01(section.energy + bias);
}

function cadencePattern(
  section: MusicSection,
  pace: Required<EditPlannerOptions>['pace'],
) {
  const intensity = sectionIntensity(section);
  const base =
    intensity < 0.22
      ? [16, 8, 12, 8]
      : intensity < 0.45
        ? [8, 6, 4, 8, 4]
        : intensity < 0.68
          ? [4, 2, 4, 6, 2, 4]
          : intensity < 0.84
            ? [2, 4, 2, 1, 4, 2, 3]
            : [1, 2, 1, 4, 2, 1, 2, 3, 1];

  if (pace === 'balanced') return base;
  const multiplier = pace === 'relaxed' ? 1.5 : 0.6;
  return base.map((span) => Math.max(1, Math.round(span * multiplier)));
}

function nextBeatIndexAtOrAfter(music: MusicMap, time: number) {
  const index = music.beats.findIndex((beat) => beat.time >= time - EPSILON);
  return index === -1 ? music.beats.length : index;
}

function beatTime(music: MusicMap, index: number) {
  return music.beats[index]?.time ?? music.duration;
}

function previousBeatTimeAtOrBefore(music: MusicMap, time: number, minimum: number) {
  for (let index = music.beats.length - 1; index >= 0; index -= 1) {
    const candidate = music.beats[index]?.time;
    if (
      candidate !== undefined
      && candidate <= time + EPSILON
      && candidate > minimum + EPSILON
    ) {
      return candidate;
    }
  }
  return null;
}

function capSlotToAvailableShot(
  music: MusicMap,
  start: number,
  proposedEnd: number,
  maxShotDuration: number,
) {
  if (proposedEnd - start <= maxShotDuration + EPSILON) return proposedEnd;

  const beatLimited = previousBeatTimeAtOrBefore(
    music,
    start + maxShotDuration,
    start,
  );
  if (beatLimited !== null) return beatLimited;

  return Math.min(proposedEnd, start + maxShotDuration);
}

function buildTimelineSlots(
  context: PlannerContext,
  rangeStart: number,
  rangeEnd: number,
) {
  const { music, maxShotDuration } = context;
  const slots: TimelineSlot[] = [];
  const patternIndices = new Map<string, number>();

  let cursor = rangeStart;

  while (cursor < rangeEnd - EPSILON) {
    const section = sectionAt(music, cursor);
    const pattern = cadencePattern(section, context.options.pace);
    const patternIndex = patternIndices.get(section.id) ?? 0;
    const requestedSpan = pattern[patternIndex % pattern.length] ?? 4;
    patternIndices.set(section.id, patternIndex + 1);

    const currentBeat = nextBeatIndexAtOrAfter(music, cursor);
    let end = beatTime(music, currentBeat + requestedSpan);

    const sectionEnd = Math.min(section.end, rangeEnd);
    if (sectionEnd > cursor + EPSILON && sectionEnd < end - EPSILON) {
      // Section analysis is descriptive evidence, not an edit grid. Never let
      // a section timestamp create an off-beat cut: move the boundary to the
      // last verified beat before that section edge.
      const beatLockedSectionEnd = previousBeatTimeAtOrBefore(
        music,
        sectionEnd,
        cursor,
      );
      if (beatLockedSectionEnd !== null) end = beatLockedSectionEnd;
    }
    end = Math.min(end, rangeEnd);

    if (end <= cursor + EPSILON) {
      const nextBeat = beatTime(music, currentBeat + 1);
      end = Math.min(rangeEnd, Math.max(nextBeat, cursor + 0.05));
    }

    end = capSlotToAvailableShot(music, cursor, end, maxShotDuration);

    if (end <= cursor + EPSILON) {
      throw new Error('Unable to create a positive-length edit slot from the supplied media.');
    }

    const beatSpan = Math.max(
      1,
      music.beats.filter(
        (beat) => beat.time >= cursor - EPSILON && beat.time < end - EPSILON,
      ).length,
    );

    slots.push({ start: cursor, end, section, beatSpan });
    cursor = end;
  }

  return slots;
}

function hash01(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function sourceWeight(
  weights: Record<string, number>,
  sourceId: string,
) {
  const value = weights[sourceId] ?? 1;
  return Math.max(0.25, Math.min(2, Number.isFinite(value) ? value : 1));
}

function chooseShot(
  context: PlannerContext,
  slot: TimelineSlot,
  segmentIndex: number,
  recentShotIds: string[],
  recentSourceIds: string[],
  sourceUseCounts: Map<string, number>,
) {
  const { shots, sourceIds, options } = context;
  const duration = slot.end - slot.start;
  const eligible = shots.filter(
    (shot) => shot.end - shot.start >= duration - EPSILON,
  );
  let candidates = eligible.length > 0 ? eligible : shots;

  if (candidates.length === 0) {
    throw new Error('Auto edit requires at least one analyzed footage shot.');
  }

  if (options.sourceMix === 'rotate' && sourceIds.length > 1) {
    const targetSourceId = sourceIds[segmentIndex % sourceIds.length];
    const targetCandidates = candidates.filter(
      (shot) => shot.sourceId === targetSourceId,
    );
    if (targetCandidates.length > 0) candidates = targetCandidates;
  }

  const targetMotion = clamp01(sectionIntensity(slot.section));
  const minimumUseCount =
    sourceIds.length > 0
      ? Math.min(...sourceIds.map((sourceId) => sourceUseCounts.get(sourceId) ?? 0))
      : 0;

  return [...candidates].sort((left, right) => {
    const score = (shot: ClipShot) => {
      const durationFit = Math.min(1, (shot.end - shot.start) / Math.max(duration, 0.05));
      const motionFit = 1 - Math.abs(clamp01(shot.motion) - targetMotion);
      const reusePenalty = recentShotIds.includes(shot.id) ? 0.8 : 0;
      const immediateSourcePenalty = recentSourceIds[0] === shot.sourceId ? 0.24 : 0;
      const recentSourcePenalty =
        recentSourceIds.slice(1).includes(shot.sourceId) ? 0.06 : 0;
      const useCount = sourceUseCounts.get(shot.sourceId) ?? 0;
      const balancedPenalty =
        options.sourceMix === 'balanced'
          ? Math.max(0, useCount - minimumUseCount) * 0.18
          : 0;
      const weightedBoost =
        options.sourceMix === 'weighted'
          ? (sourceWeight(options.sourceWeights, shot.sourceId) - 1) * 0.22
          : 0;
      const sourcePenalty =
        options.sourceMix === 'rotate'
          ? 0
          : immediateSourcePenalty + recentSourcePenalty + balancedPenalty;
      const tieBreak = hash01(`${options.seed}:${segmentIndex}:${shot.id}`) * 0.02;

      return (
        clamp01(shot.quality) * 0.42
        + motionFit * 0.38
        + durationFit * 0.18
        + weightedBoost
        + tieBreak
        - reusePenalty
        - sourcePenalty
      );
    };

    return score(right) - score(left);
  })[0]!;
}

function chooseSourceRange(
  shot: ClipShot,
  duration: number,
  seed: number,
  segmentIndex: number,
) {
  const available = Math.max(0, shot.end - shot.start - duration);
  const offset = available * hash01(`${seed}:range:${segmentIndex}:${shot.id}`);
  const sourceStart = shot.start + offset;
  return {
    sourceStart,
    sourceEnd: Math.min(shot.end, sourceStart + duration),
  };
}

function isStrongSectionAccent(music: MusicMap, slot: TimelineSlot) {
  const section = slot.section;
  const atSectionStart = Math.abs(slot.start - section.start) <= 0.08;
  if (!atSectionStart) return false;
  if (!['drop', 'chorus', 'build'].includes(section.kind)) return false;

  const previous = [...music.sections]
    .filter((candidate) => candidate.end <= section.start + 0.08)
    .sort((left, right) => right.end - left.end)[0];

  const energyJump = previous
    ? section.energy - previous.energy
    : section.energy;

  return section.kind === 'drop' || energyJump >= 0.16;
}

function filmBurnDuration(music: MusicMap) {
  const beatSeconds = music.bpm && music.bpm > 0 ? 60 / music.bpm : 0.5;
  return Math.max(0.22, Math.min(0.42, beatSeconds * 0.65));
}

function availableTransitionHandles(
  transitionDuration: number,
  alignment: number,
  left: EditSegment,
  right: EditSegment,
  shotsById: Map<string, ClipShot>,
) {
  const leftShot = shotsById.get(left.shotId);
  const rightShot = shotsById.get(right.shotId);
  if (!leftShot || !rightShot) return false;

  const leftNeeded = transitionDuration * alignment;
  const rightNeeded = transitionDuration * (1 - alignment);
  const leftAvailable = leftShot.end - left.sourceEnd;
  const rightAvailable = right.sourceStart - rightShot.start;

  return (
    leftAvailable + EPSILON >= leftNeeded
    && rightAvailable + EPSILON >= rightNeeded
  );
}

function buildEffectTransitions(
  context: PlannerContext,
  slots: TimelineSlot[],
  segments: EditSegment[],
  motifId?: string,
) {
  if (context.options.transitionProfile === 'clean') return [];

  const transitions: EditTransition[] = [];
  const shotsById = new Map(context.shots.map((shot) => [shot.id, shot]));
  let lastAccentTransitionTime: number | null = null;

  for (let index = 1; index < segments.length; index += 1) {
    const slot = slots[index];
    const left = segments[index - 1];
    const right = segments[index];
    if (!slot || !left || !right) continue;
    if (!isStrongSectionAccent(context.music, slot)) continue;

    const minimumSpacingSeconds = context.music.bpm
      ? (60 / context.music.bpm) * context.music.beatsPerBar * 4
      : 8;

    if (
      lastAccentTransitionTime !== null
      && slot.start - lastAccentTransitionTime < minimumSpacingSeconds - EPSILON
    ) {
      continue;
    }

    const duration = filmBurnDuration(context.music);
    const alignment = 0.5;
    if (!availableTransitionHandles(
      duration,
      alignment,
      left,
      right,
      shotsById,
    )) {
      continue;
    }

    // Accent mode stays sparse and alternates two real transition renderers.
    // The style is intentionally generic: these are universal edit accents,
    // not a genre-specific "Detroit" mode.
    const kind =
      transitions.length % 2 === 1
        ? 'film-gate'
        : 'film-burn';

    transitions.push({
      id: `transition-${transitions.length + 1}`,
      kind,
      leftSegmentId: left.id,
      rightSegmentId: right.id,
      cutTime: slot.start,
      duration,
      alignment,
      reason: `${slot.section.kind} section accent`,
      motifId,
    });
    lastAccentTransitionTime = slot.start;
  }

  return transitions;
}

function slotsToSegments(
  context: PlannerContext,
  slots: TimelineSlot[],
  motifId?: string,
  idPrefix = 'segment',
) {
  const segments: EditSegment[] = [];
  const recentShotIds: string[] = [];
  const recentSourceIds: string[] = [];
  const sourceUseCounts = new Map<string, number>();

  slots.forEach((slot, segmentIndex) => {
    const shot = chooseShot(
      context,
      slot,
      segmentIndex,
      recentShotIds,
      recentSourceIds,
      sourceUseCounts,
    );
    const duration = slot.end - slot.start;
    const range = chooseSourceRange(
      shot,
      duration,
      context.options.seed,
      segmentIndex,
    );
    const segment: EditSegment = {
      id: `${idPrefix}-${segmentIndex + 1}`,
      timelineStart: slot.start,
      timelineEnd: slot.end,
      sourceId: shot.sourceId,
      shotId: shot.id,
      sourceStart: range.sourceStart,
      sourceEnd: range.sourceEnd,
      reason: `${slot.section.kind} · ${slot.beatSpan} beat${slot.beatSpan === 1 ? '' : 's'} · energy ${slot.section.energy.toFixed(2)}`,
      motifId,
      motifSlot: motifId ? `slot-${segmentIndex + 1}` : undefined,
    };

    segments.push(segment);
    recentShotIds.unshift(shot.id);
    if (recentShotIds.length > 2) recentShotIds.pop();
    recentSourceIds.unshift(shot.sourceId);
    if (recentSourceIds.length > 2) recentSourceIds.pop();
    sourceUseCounts.set(
      shot.sourceId,
      (sourceUseCounts.get(shot.sourceId) ?? 0) + 1,
    );
  });

  return segments;
}

function beatTimeAtOrAfter(music: MusicMap, time: number) {
  const index = nextBeatIndexAtOrAfter(music, time);
  return music.beats[index]?.time ?? null;
}

function beatTimeAtOrBefore(music: MusicMap, time: number) {
  for (let index = music.beats.length - 1; index >= 0; index -= 1) {
    const candidate = music.beats[index]?.time;
    if (candidate !== undefined && candidate <= time + EPSILON) return candidate;
  }
  return null;
}

function resolveLoopBodyRange(music: MusicMap) {
  const intro = [...music.sections]
    .filter(
      (section) =>
        section.kind === 'intro' &&
        section.confidence >= EDGE_SECTION_CONFIDENCE &&
        section.start <= EDGE_SECTION_TOLERANCE_SECONDS,
    )
    .sort((left, right) => left.start - right.start)[0] ?? null;

  const outro = [...music.sections]
    .filter(
      (section) =>
        section.kind === 'outro' &&
        section.confidence >= EDGE_SECTION_CONFIDENCE &&
        section.end >= music.duration - EDGE_SECTION_TOLERANCE_SECONDS,
    )
    .sort((left, right) => right.start - left.start)[0] ?? null;

  const introBoundary = intro ? beatTimeAtOrAfter(music, intro.end) : null;
  const outroBoundary = outro ? beatTimeAtOrBefore(music, outro.start) : null;
  const bodyStart = Math.max(0, introBoundary ?? 0);
  const bodyEnd = Math.min(music.duration, outroBoundary ?? music.duration);

  // Edge labels are descriptive evidence. If they consume the useful body or
  // cannot be projected onto a positive beat-locked range, fall back to the
  // established full-song motif behavior instead of fabricating structure.
  if (bodyEnd <= bodyStart + EPSILON) {
    return {
      bodyStart: 0,
      bodyEnd: music.duration,
      hasIntro: false,
      hasOutro: false,
    };
  }

  return {
    bodyStart,
    bodyEnd,
    hasIntro: intro !== null && bodyStart > EPSILON,
    hasOutro: outro !== null && bodyEnd < music.duration - EPSILON,
  };
}

function loopEndTime(
  music: MusicMap,
  loopBars: number,
  rangeStart = 0,
  rangeEnd = music.duration,
) {
  const beatsToLoop = Math.max(1, Math.round(loopBars * music.beatsPerBar));
  const firstBeatIndex = nextBeatIndexAtOrAfter(music, rangeStart);
  const targetBeat = music.beats[firstBeatIndex + beatsToLoop];
  if (targetBeat && targetBeat.time > rangeStart + EPSILON) {
    return Math.min(targetBeat.time, rangeEnd);
  }

  if (music.bpm && music.bpm > 0) {
    return Math.min(
      rangeEnd,
      rangeStart + loopBars * music.beatsPerBar * (60 / music.bpm),
    );
  }

  return Math.min(rangeEnd, Math.max(rangeStart + 1, rangeEnd));
}

function appendTransitions(
  target: EditTransition[],
  additions: EditTransition[],
) {
  const appended = additions.map((transition, index) => ({
    ...transition,
    id: `transition-${target.length + index + 1}`,
  }));
  target.push(...appended);
  return appended;
}

function buildLoopPlan(context: PlannerContext): EditPlan {
  const { bodyStart, bodyEnd, hasIntro, hasOutro } = resolveLoopBodyRange(context.music);
  const motifEnd = loopEndTime(
    context.music,
    context.options.loopBars,
    bodyStart,
    bodyEnd,
  );
  const motifDuration = motifEnd - bodyStart;

  if (motifDuration <= EPSILON) {
    return buildLinearPlan(context);
  }

  const motifId = 'motif-1';
  const segments: EditSegment[] = [];
  const transitions: EditTransition[] = [];

  if (hasIntro) {
    const introSlots = buildTimelineSlots(context, 0, bodyStart);
    const introSegments = slotsToSegments(
      context,
      introSlots,
      undefined,
      'intro-segment',
    );
    segments.push(...introSegments);
    appendTransitions(
      transitions,
      buildEffectTransitions(context, introSlots, introSegments),
    );
  }

  const motifSlots = buildTimelineSlots(context, bodyStart, motifEnd);
  const motifSegments = slotsToSegments(
    context,
    motifSlots,
    motifId,
    'motif-segment',
  );
  const motifTransitions = buildEffectTransitions(
    context,
    motifSlots,
    motifSegments,
    motifId,
  );
  const motifSegmentIndex = new Map(
    motifSegments.map((segment, index) => [segment.id, index]),
  );
  const motifTransitionIds: string[] = [];
  const motifSegmentIds: string[] = [];

  let repeatStart = bodyStart;
  let repeatIndex = 0;
  while (repeatStart < bodyEnd - EPSILON) {
    const repeatedSegments: EditSegment[] = [];

    for (const motifSegment of motifSegments) {
      const relativeStart = motifSegment.timelineStart - bodyStart;
      const relativeEnd = motifSegment.timelineEnd - bodyStart;
      const timelineStart = repeatStart + relativeStart;
      if (timelineStart >= bodyEnd - EPSILON) break;

      const fullDuration = relativeEnd - relativeStart;
      const duration = Math.min(
        fullDuration,
        bodyEnd - timelineStart,
      );

      const repeated: EditSegment = {
        ...motifSegment,
        id: `segment-${segments.length + 1}`,
        timelineStart,
        timelineEnd: timelineStart + duration,
        sourceEnd: Math.min(
          motifSegment.sourceEnd,
          motifSegment.sourceStart + duration,
        ),
        reason: `${motifSegment.reason} · loop ${repeatIndex + 1}`,
      };
      segments.push(repeated);
      repeatedSegments.push(repeated);
      if (repeatIndex === 0) motifSegmentIds.push(repeated.id);
    }

    for (const motifTransition of motifTransitions) {
      const leftIndex = motifSegmentIndex.get(motifTransition.leftSegmentId);
      const rightIndex = motifSegmentIndex.get(motifTransition.rightSegmentId);
      if (leftIndex === undefined || rightIndex === undefined) continue;

      const left = repeatedSegments[leftIndex];
      const right = repeatedSegments[rightIndex];
      if (!left || !right) continue;

      const repeatedTransition: EditTransition = {
        ...motifTransition,
        id: `transition-${transitions.length + 1}`,
        leftSegmentId: left.id,
        rightSegmentId: right.id,
        cutTime: repeatStart + (motifTransition.cutTime - bodyStart),
      };
      transitions.push(repeatedTransition);
      if (repeatIndex === 0) motifTransitionIds.push(repeatedTransition.id);
    }

    repeatIndex += 1;
    repeatStart += motifDuration;
  }

  if (hasOutro) {
    const outroSlots = buildTimelineSlots(context, bodyEnd, context.music.duration);
    const outroSegments = slotsToSegments(
      context,
      outroSlots,
      undefined,
      'outro-segment',
    );
    segments.push(...outroSegments);
    appendTransitions(
      transitions,
      buildEffectTransitions(context, outroSlots, outroSegments),
    );
  }

  const motif: EditMotif = {
    id: motifId,
    start: bodyStart,
    duration: motifDuration,
    bars: context.options.loopBars,
    segmentIds: motifSegmentIds,
    transitionIds: motifTransitionIds,
  };

  const warnings = [
    ...(hasIntro ? ['Reliable intro kept outside Loop A.'] : []),
    ...(hasOutro ? ['Reliable outro kept outside Loop A.'] : []),
  ];

  return {
    mode: 'loop',
    duration: context.music.duration,
    segments,
    transitions,
    motifs: [motif],
    warnings,
  };
}

function buildLinearPlan(context: PlannerContext): EditPlan {
  const slots = buildTimelineSlots(context, 0, context.music.duration);
  const segments = slotsToSegments(context, slots);
  const transitions = buildEffectTransitions(context, slots, segments);

  return {
    mode: context.options.mode,
    duration: context.music.duration,
    segments,
    transitions,
    motifs: [],
    warnings: [],
  };
}

function validateInputs(music: MusicMap, clips: ClipMap) {
  if (!Number.isFinite(music.duration) || music.duration <= 0) {
    throw new Error('Music map duration must be positive.');
  }
  if (!Number.isInteger(music.beatsPerBar) || music.beatsPerBar <= 0) {
    throw new Error('Music map beatsPerBar must be a positive integer.');
  }

  for (let index = 1; index < music.beats.length; index += 1) {
    if ((music.beats[index]?.time ?? 0) <= (music.beats[index - 1]?.time ?? 0)) {
      throw new Error('Music beats must be strictly increasing.');
    }
  }

  for (const source of clips.sources) {
    for (const shot of source.shots) {
      if (shot.sourceId !== source.id) {
        throw new Error(`Shot ${shot.id} does not belong to source ${source.id}.`);
      }
      if (shot.end <= shot.start) {
        throw new Error(`Shot ${shot.id} must have positive duration.`);
      }
    }
  }
}

export function offsetEditPlanTimeline(plan: EditPlan, offsetSeconds: number): EditPlan {
  const offset = Number.isFinite(offsetSeconds) ? offsetSeconds : 0
  if (Math.abs(offset) <= EPSILON) return plan

  return {
    ...plan,
    segments: plan.segments.map((segment) => ({
      ...segment,
      timelineStart: segment.timelineStart + offset,
      timelineEnd: segment.timelineEnd + offset,
    })),
    transitions: plan.transitions.map((transition) => ({
      ...transition,
      cutTime: transition.cutTime + offset,
    })),
    motifs: plan.motifs.map((motif) => ({
      ...motif,
      start: motif.start + offset,
    })),
  }
}

export function createSingleClipLoopPlan(params: {
  sourceId: string
  sourceDuration: number
  timelineStart?: number
  timelineDuration: number
}): EditPlan {
  const sourceDuration = params.sourceDuration
  const timelineStart = Math.max(0, params.timelineStart ?? 0)
  const timelineDuration = params.timelineDuration

  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) {
    throw new Error('Loop source duration must be positive.')
  }
  if (!Number.isFinite(timelineDuration) || timelineDuration <= 0) {
    throw new Error('Loop timeline duration must be positive.')
  }

  const segments: EditSegment[] = []
  let elapsed = 0

  while (elapsed < timelineDuration - EPSILON) {
    const duration = Math.min(sourceDuration, timelineDuration - elapsed)
    const index = segments.length + 1
    segments.push({
      id: `segment-${index}`,
      timelineStart: timelineStart + elapsed,
      timelineEnd: timelineStart + elapsed + duration,
      sourceId: params.sourceId,
      shotId: `single-loop-${index}`,
      sourceStart: 0,
      sourceEnd: duration,
      reason: index === 1 ? 'single clip loop' : `single clip loop · repeat ${index}`,
    })
    elapsed += duration
  }

  return {
    mode: 'loop',
    duration: timelineDuration,
    segments,
    transitions: [],
    motifs: [],
    warnings: [],
  }
}

export function createEditPlan(
  music: MusicMap,
  clips: ClipMap,
  options: EditPlannerOptions,
): EditPlan {
  validateInputs(music, clips);

  const excludedShotIds = new Set(options.excludedShotIds ?? []);
  const footageSources = clips.sources.filter(
    (source) => (source.role ?? 'footage') === 'footage',
  );
  const sourceIds = footageSources.map((source) => source.id);
  const shots = footageSources
    .flatMap((source) => source.shots)
    .filter((shot) => !excludedShotIds.has(shot.id));
  if (shots.length === 0) {
    throw new Error(
      excludedShotIds.size > 0
        ? 'Every analyzed footage shot is excluded. Re-enable at least one shot.'
        : 'Auto edit requires at least one analyzed footage shot.',
    );
  }

  const maxShotDuration = Math.max(
    ...shots.map((shot) => shot.end - shot.start),
  );

  const normalizedOptions: Required<EditPlannerOptions> = {
    mode: options.mode,
    loopBars: Math.max(1, Math.round(options.loopBars ?? 8)),
    transitionProfile: options.transitionProfile ?? 'clean',
    pace: options.pace ?? 'balanced',
    sourceMix: options.sourceMix ?? 'balanced',
    sourceWeights: { ...(options.sourceWeights ?? {}) },
    excludedShotIds: [...excludedShotIds],
    seed: Math.round(options.seed ?? 1),
  };

  const context: PlannerContext = {
    music,
    shots,
    sourceIds,
    maxShotDuration,
    options: normalizedOptions,
  };

  if (normalizedOptions.mode === 'loop') return buildLoopPlan(context);
  return buildLinearPlan(context);
}
