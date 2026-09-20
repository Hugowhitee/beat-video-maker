import type {
  ClipMap,
  ClipShot,
  EditMotif,
  EditPlan,
  EditPlannerOptions,
  EditSegment,
  EditTransition,
  MusicMap,
  MusicSection,
} from './types';

const EPSILON = 1e-6;

type TimelineSlot = {
  start: number;
  end: number;
  section: MusicSection;
  beatSpan: number;
};

type PlannerContext = {
  music: MusicMap;
  shots: ClipShot[];
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
  ) ?? music.sections.find(
    (section) => Math.abs(time - section.end) <= EPSILON,
  ) ?? { ...FALLBACK_SECTION, end: music.duration };
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

function cadencePattern(section: MusicSection) {
  const intensity = sectionIntensity(section);

  if (intensity < 0.22) return [16, 8, 12, 8];
  if (intensity < 0.45) return [8, 6, 4, 8, 4];
  if (intensity < 0.68) return [4, 2, 4, 6, 2, 4];
  if (intensity < 0.84) return [2, 4, 2, 1, 4, 2, 3];
  return [1, 2, 1, 4, 2, 1, 2, 3, 1];
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
    const pattern = cadencePattern(section);
    const patternIndex = patternIndices.get(section.id) ?? 0;
    const requestedSpan = pattern[patternIndex % pattern.length] ?? 4;
    patternIndices.set(section.id, patternIndex + 1);

    const currentBeat = nextBeatIndexAtOrAfter(music, cursor);
    let end = beatTime(music, currentBeat + requestedSpan);

    const sectionEnd = Math.min(section.end, rangeEnd);
    if (sectionEnd > cursor + EPSILON) end = Math.min(end, sectionEnd);
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

function chooseShot(
  shots: ClipShot[],
  slot: TimelineSlot,
  segmentIndex: number,
  seed: number,
  recentShotIds: string[],
) {
  const duration = slot.end - slot.start;
  const eligible = shots.filter(
    (shot) => shot.end - shot.start >= duration - EPSILON,
  );
  const candidates = eligible.length > 0 ? eligible : shots;

  if (candidates.length === 0) {
    throw new Error('Auto edit requires at least one analyzed source-video shot.');
  }

  const targetMotion = clamp01(sectionIntensity(slot.section));

  return [...candidates].sort((left, right) => {
    const score = (shot: ClipShot) => {
      const durationFit = Math.min(1, (shot.end - shot.start) / Math.max(duration, 0.05));
      const motionFit = 1 - Math.abs(clamp01(shot.motion) - targetMotion);
      const reusePenalty = recentShotIds.includes(shot.id) ? 0.8 : 0;
      const tieBreak = hash01(`${seed}:${segmentIndex}:${shot.id}`) * 0.02;
      return (
        clamp01(shot.quality) * 0.42
        + motionFit * 0.38
        + durationFit * 0.18
        + tieBreak
        - reusePenalty
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

function transitionForSlot(
  context: PlannerContext,
  slot: TimelineSlot,
  segmentIndex: number,
  lastFilmBurnTime: number | null,
) : EditTransition {
  if (segmentIndex === 0) return 'none';
  if (context.options.transitionProfile === 'clean') return 'cut';
  if (!isStrongSectionAccent(context.music, slot)) return 'cut';

  const minimumSpacingSeconds = context.music.bpm
    ? (60 / context.music.bpm) * context.music.beatsPerBar * 4
    : 8;

  if (
    lastFilmBurnTime !== null
    && slot.start - lastFilmBurnTime < minimumSpacingSeconds - EPSILON
  ) {
    return 'cut';
  }

  return 'film-burn';
}

function slotsToSegments(
  context: PlannerContext,
  slots: TimelineSlot[],
  motifId?: string,
) {
  const segments: EditSegment[] = [];
  const recentShotIds: string[] = [];
  let lastFilmBurnTime: number | null = null;

  slots.forEach((slot, segmentIndex) => {
    const shot = chooseShot(
      context.shots,
      slot,
      segmentIndex,
      context.options.seed,
      recentShotIds,
    );
    const duration = slot.end - slot.start;
    const range = chooseSourceRange(
      shot,
      duration,
      context.options.seed,
      segmentIndex,
    );
    const transitionIn = transitionForSlot(
      context,
      slot,
      segmentIndex,
      lastFilmBurnTime,
    );

    if (transitionIn === 'film-burn') lastFilmBurnTime = slot.start;

    const segment: EditSegment = {
      id: `segment-${segmentIndex + 1}`,
      timelineStart: slot.start,
      timelineEnd: slot.end,
      sourceId: shot.sourceId,
      shotId: shot.id,
      sourceStart: range.sourceStart,
      sourceEnd: range.sourceEnd,
      transitionIn,
      reason: `${slot.section.kind} · ${slot.beatSpan} beat${slot.beatSpan === 1 ? '' : 's'} · energy ${slot.section.energy.toFixed(2)}`,
      motifId,
    };

    segments.push(segment);
    recentShotIds.unshift(shot.id);
    if (recentShotIds.length > 2) recentShotIds.pop();
  });

  return segments;
}

function loopEndTime(music: MusicMap, loopBars: number) {
  const beatsToLoop = Math.max(1, Math.round(loopBars * music.beatsPerBar));
  const firstBeatIndex = nextBeatIndexAtOrAfter(music, 0);
  const targetBeat = music.beats[firstBeatIndex + beatsToLoop];
  if (targetBeat && targetBeat.time > EPSILON) {
    return Math.min(targetBeat.time, music.duration);
  }

  if (music.bpm && music.bpm > 0) {
    return Math.min(
      music.duration,
      loopBars * music.beatsPerBar * (60 / music.bpm),
    );
  }

  return Math.min(music.duration, Math.max(1, music.duration));
}

function buildLoopPlan(context: PlannerContext): EditPlan {
  const loopDuration = loopEndTime(context.music, context.options.loopBars);
  const motifId = 'motif-1';
  const motifSlots = buildTimelineSlots(context, 0, loopDuration);
  const motifSegments = slotsToSegments(context, motifSlots, motifId);
  const segments: EditSegment[] = [];

  let repeatStart = 0;
  let repeatIndex = 0;
  while (repeatStart < context.music.duration - EPSILON) {
    for (const motifSegment of motifSegments) {
      const relativeStart = motifSegment.timelineStart;
      const relativeEnd = motifSegment.timelineEnd;
      const timelineStart = repeatStart + relativeStart;
      if (timelineStart >= context.music.duration - EPSILON) break;

      const fullDuration = relativeEnd - relativeStart;
      const duration = Math.min(
        fullDuration,
        context.music.duration - timelineStart,
      );

      segments.push({
        ...motifSegment,
        id: `segment-${segments.length + 1}`,
        timelineStart,
        timelineEnd: timelineStart + duration,
        sourceEnd: Math.min(
          motifSegment.sourceEnd,
          motifSegment.sourceStart + duration,
        ),
        transitionIn: segments.length === 0
          ? 'none'
          : motifSegment.transitionIn === 'none'
            ? 'cut'
            : motifSegment.transitionIn,
        reason: `${motifSegment.reason} · loop ${repeatIndex + 1}`,
      });
    }

    repeatIndex += 1;
    repeatStart += loopDuration;
  }

  const motif: EditMotif = {
    id: motifId,
    start: 0,
    duration: loopDuration,
    bars: context.options.loopBars,
    segmentIds: motifSegments.map((segment) => segment.id),
  };

  return {
    mode: 'loop',
    duration: context.music.duration,
    segments,
    motifs: [motif],
    warnings: [],
  };
}

function buildLinearPlan(context: PlannerContext): EditPlan {
  const slots = buildTimelineSlots(context, 0, context.music.duration);
  const segments = slotsToSegments(context, slots);

  return {
    mode: context.options.mode,
    duration: context.music.duration,
    segments,
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

export function createEditPlan(
  music: MusicMap,
  clips: ClipMap,
  options: EditPlannerOptions,
): EditPlan {
  validateInputs(music, clips);

  const shots = clips.sources.flatMap((source) => source.shots);
  if (shots.length === 0) {
    throw new Error('Auto edit requires at least one analyzed source-video shot.');
  }

  const maxShotDuration = Math.max(
    ...shots.map((shot) => shot.end - shot.start),
  );

  const normalizedOptions: Required<EditPlannerOptions> = {
    mode: options.mode,
    loopBars: Math.max(1, Math.round(options.loopBars ?? 8)),
    transitionProfile: options.transitionProfile ?? 'clean',
    seed: Math.round(options.seed ?? 1),
  };

  const context: PlannerContext = {
    music,
    shots,
    maxShotDuration,
    options: normalizedOptions,
  };

  if (normalizedOptions.mode === 'loop') return buildLoopPlan(context);
  return buildLinearPlan(context);
}
