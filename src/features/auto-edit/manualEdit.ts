import type {
  ClipMap,
  ClipShot,
  EditPlan,
  EditSegment,
  EditTransition,
  EditTransitionKind,
  MusicMap,
} from './types';

const EPSILON = 1e-6;
const MIN_SEGMENT_SECONDS = 0.05;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function segmentDuration(segment: EditSegment) {
  return segment.timelineEnd - segment.timelineStart;
}

function shotMap(clips: ClipMap) {
  return new Map(
    clips.sources.flatMap((source) => source.shots).map((shot) => [shot.id, shot] as const),
  );
}

function sourceForShot(clips: ClipMap, shotId: string) {
  for (const source of clips.sources) {
    if (source.shots.some((shot) => shot.id === shotId)) return source.id;
  }
  return null;
}

function linkedSegments(plan: EditPlan, segment: EditSegment) {
  if (!segment.motifId || !segment.motifSlot) return [segment];
  return plan.segments.filter(
    (candidate) =>
      candidate.motifId === segment.motifId
      && candidate.motifSlot === segment.motifSlot,
  );
}

function linkedBoundaryPairs(
  plan: EditPlan,
  left: EditSegment,
  right: EditSegment,
) {
  if (
    !left.motifId
    || left.motifId !== right.motifId
    || !left.motifSlot
    || !right.motifSlot
  ) {
    return [{ left, right }];
  }

  const sorted = [...plan.segments].sort((a, b) => a.timelineStart - b.timelineStart);
  const pairs: Array<{ left: EditSegment; right: EditSegment }> = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const candidateLeft = sorted[index];
    const candidateRight = sorted[index + 1];
    if (
      candidateLeft?.motifId === left.motifId
      && candidateRight?.motifId === left.motifId
      && candidateLeft.motifSlot === left.motifSlot
      && candidateRight.motifSlot === right.motifSlot
      && Math.abs(candidateLeft.timelineEnd - candidateRight.timelineStart) <= EPSILON
    ) {
      pairs.push({ left: candidateLeft, right: candidateRight });
    }
  }

  return pairs.length ? pairs : [{ left, right }];
}

function transitionHasHandles(
  transition: EditTransition,
  segments: Map<string, EditSegment>,
  shots: Map<string, ClipShot>,
) {
  const left = segments.get(transition.leftSegmentId);
  const right = segments.get(transition.rightSegmentId);
  if (!left || !right) return false;
  if (Math.abs(left.timelineEnd - right.timelineStart) > EPSILON) return false;
  if (Math.abs(transition.cutTime - left.timelineEnd) > 0.01) return false;

  const leftShot = shots.get(left.shotId);
  const rightShot = shots.get(right.shotId);
  if (!leftShot || !rightShot) return false;

  const leftNeed = transition.duration * transition.alignment;
  const rightNeed = transition.duration * (1 - transition.alignment);

  return (
    leftShot.end - left.sourceEnd + EPSILON >= leftNeed
    && right.sourceStart - rightShot.start + EPSILON >= rightNeed
  );
}

function finalizePlan(plan: EditPlan, clips: ClipMap): EditPlan {
  const segments = [...plan.segments].sort((a, b) => a.timelineStart - b.timelineStart);
  const segmentsById = new Map(segments.map((segment) => [segment.id, segment]));
  const shots = shotMap(clips);
  const transitions = plan.transitions.filter((transition) =>
    transitionHasHandles(transition, segmentsById, shots)
  );
  const transitionIds = new Set(transitions.map((transition) => transition.id));

  return {
    ...plan,
    segments,
    transitions,
    motifs: plan.motifs.map((motif) => ({
      ...motif,
      segmentIds: motif.segmentIds.filter((id) => segmentsById.has(id)),
      transitionIds: motif.transitionIds.filter((id) => transitionIds.has(id)),
    })),
  };
}

function requireSegment(plan: EditPlan, segmentId: string) {
  const segment = plan.segments.find((candidate) => candidate.id === segmentId);
  if (!segment) throw new Error(`Unknown edit segment: ${segmentId}`);
  return segment;
}

function requireShot(clips: ClipMap, shotId: string) {
  const shot = shotMap(clips).get(shotId);
  if (!shot) throw new Error(`Unknown source shot: ${shotId}`);
  return shot;
}

function markManual(segment: EditSegment): EditSegment {
  return { ...segment, manualOverride: true };
}

export function replaceSegmentSource(
  plan: EditPlan,
  clips: ClipMap,
  segmentId: string,
  shotId: string,
  requestedSourceStart?: number,
): EditPlan {
  const selected = requireSegment(plan, segmentId);
  const targets = linkedSegments(plan, selected);
  const shot = requireShot(clips, shotId);
  const sourceId = sourceForShot(clips, shotId);
  if (!sourceId) throw new Error(`Shot ${shotId} has no source.`);

  const maximumDuration = Math.max(...targets.map(segmentDuration));
  if (shot.end - shot.start + EPSILON < maximumDuration) {
    throw new Error('Source shot is too short for this musical slot.');
  }

  const maximumStart = shot.end - maximumDuration;
  const sourceStart = clamp(
    requestedSourceStart ?? shot.start,
    shot.start,
    maximumStart,
  );
  const targetIds = new Set(targets.map((segment) => segment.id));

  const next = {
    ...plan,
    segments: plan.segments.map((segment) => {
      if (!targetIds.has(segment.id)) return segment;
      const duration = segmentDuration(segment);
      return markManual({
        ...segment,
        sourceId,
        shotId,
        sourceStart,
        sourceEnd: sourceStart + duration,
        reason: 'manual source replace',
      });
    }),
  };

  return finalizePlan(next, clips);
}

export function slipSegmentSource(
  plan: EditPlan,
  clips: ClipMap,
  segmentId: string,
  requestedDeltaSeconds: number,
): EditPlan {
  const selected = requireSegment(plan, segmentId);
  const targets = linkedSegments(plan, selected);
  const shots = shotMap(clips);

  let minimumDelta = Number.NEGATIVE_INFINITY;
  let maximumDelta = Number.POSITIVE_INFINITY;

  for (const segment of targets) {
    const shot = shots.get(segment.shotId);
    if (!shot) throw new Error(`Unknown source shot: ${segment.shotId}`);
    minimumDelta = Math.max(minimumDelta, shot.start - segment.sourceStart);
    maximumDelta = Math.min(maximumDelta, shot.end - segment.sourceEnd);
  }

  const delta = clamp(
    Number.isFinite(requestedDeltaSeconds) ? requestedDeltaSeconds : 0,
    minimumDelta,
    maximumDelta,
  );
  const targetIds = new Set(targets.map((segment) => segment.id));

  const next = {
    ...plan,
    segments: plan.segments.map((segment) => (
      targetIds.has(segment.id)
        ? markManual({
            ...segment,
            sourceStart: segment.sourceStart + delta,
            sourceEnd: segment.sourceEnd + delta,
            reason: 'manual source slip',
          })
        : segment
    )),
  };

  return finalizePlan(next, clips);
}

export function splitSegmentAt(
  plan: EditPlan,
  clips: ClipMap,
  segmentId: string,
  cutTime: number,
): EditPlan {
  const selected = requireSegment(plan, segmentId);
  const relativeCut = cutTime - selected.timelineStart;
  if (
    relativeCut < MIN_SEGMENT_SECONDS - EPSILON
    || relativeCut > segmentDuration(selected) - MIN_SEGMENT_SECONDS + EPSILON
  ) {
    throw new Error('Cut must stay inside the selected segment.');
  }

  const targets = linkedSegments(plan, selected);
  const targetIds = new Set(targets.map((segment) => segment.id));
  const replacement = new Map<string, EditSegment[]>();

  for (const segment of targets) {
    const duration = segmentDuration(segment);
    if (relativeCut >= duration - MIN_SEGMENT_SECONDS + EPSILON) {
      replacement.set(segment.id, [
        markManual({
          ...segment,
          motifSlot: segment.motifSlot ? `${segment.motifSlot}:a` : segment.motifSlot,
        }),
      ]);
      continue;
    }

    const actualCut = segment.timelineStart + relativeCut;
    const sourceCut = segment.sourceStart + relativeCut;
    const oldSlot = segment.motifSlot;
    const left = markManual({
      ...segment,
      timelineEnd: actualCut,
      sourceEnd: sourceCut,
      motifSlot: oldSlot ? `${oldSlot}:a` : oldSlot,
      reason: 'manual cut',
    });
    const right = markManual({
      ...segment,
      id: `${segment.id}-split`,
      timelineStart: actualCut,
      sourceStart: sourceCut,
      motifSlot: oldSlot ? `${oldSlot}:b` : oldSlot,
      reason: 'manual cut',
    });
    replacement.set(segment.id, [left, right]);
  }

  const segments: EditSegment[] = [];
  for (const segment of plan.segments) {
    if (!targetIds.has(segment.id)) {
      segments.push(segment);
      continue;
    }
    segments.push(...(replacement.get(segment.id) ?? [segment]));
  }

  const rightIdByOriginal = new Map(
    [...replacement.entries()]
      .filter(([, parts]) => parts.length > 1)
      .map(([id, parts]) => [id, parts[1]!.id]),
  );

  const transitions = plan.transitions.map((transition) => {
    const newLeft = rightIdByOriginal.get(transition.leftSegmentId);
    return newLeft
      ? { ...transition, leftSegmentId: newLeft }
      : transition;
  });

  const selectedParts = replacement.get(selected.id) ?? [];
  const selectedRightId = selectedParts[1]?.id;

  const motifs = plan.motifs.map((motif) => {
    if (!selectedRightId || !motif.segmentIds.includes(selected.id)) return motif;
    const nextIds: string[] = [];
    for (const id of motif.segmentIds) {
      nextIds.push(id);
      if (id === selected.id) nextIds.push(selectedRightId);
    }
    return { ...motif, segmentIds: nextIds };
  });

  return finalizePlan({ ...plan, segments, transitions, motifs }, clips);
}

export function slideCut(
  plan: EditPlan,
  clips: ClipMap,
  leftSegmentId: string,
  rightSegmentId: string,
  requestedCutTime: number,
): EditPlan {
  const left = requireSegment(plan, leftSegmentId);
  const right = requireSegment(plan, rightSegmentId);
  if (Math.abs(left.timelineEnd - right.timelineStart) > EPSILON) {
    throw new Error('Slide requires adjacent segments.');
  }

  const requestedDelta = requestedCutTime - left.timelineEnd;
  const pairs = linkedBoundaryPairs(plan, left, right);
  const shots = shotMap(clips);

  let minimumDelta = Number.NEGATIVE_INFINITY;
  let maximumDelta = Number.POSITIVE_INFINITY;

  for (const pair of pairs) {
    const leftShot = shots.get(pair.left.shotId);
    const rightShot = shots.get(pair.right.shotId);
    if (!leftShot || !rightShot) throw new Error('Slide references an unknown shot.');

    const leftDuration = segmentDuration(pair.left);
    const rightDuration = segmentDuration(pair.right);

    minimumDelta = Math.max(
      minimumDelta,
      MIN_SEGMENT_SECONDS - leftDuration,
      rightShot.start - pair.right.sourceStart,
    );
    maximumDelta = Math.min(
      maximumDelta,
      rightDuration - MIN_SEGMENT_SECONDS,
      leftShot.end - pair.left.sourceEnd,
    );
  }

  const delta = clamp(requestedDelta, minimumDelta, maximumDelta);
  const leftIds = new Set(pairs.map((pair) => pair.left.id));
  const rightIds = new Set(pairs.map((pair) => pair.right.id));

  const segments = plan.segments.map((segment) => {
    if (leftIds.has(segment.id)) {
      return markManual({
        ...segment,
        timelineEnd: segment.timelineEnd + delta,
        sourceEnd: segment.sourceEnd + delta,
        reason: 'manual cut slide',
      });
    }
    if (rightIds.has(segment.id)) {
      return markManual({
        ...segment,
        timelineStart: segment.timelineStart + delta,
        sourceStart: segment.sourceStart + delta,
        reason: 'manual cut slide',
      });
    }
    return segment;
  });

  const pairKeys = new Set(pairs.map((pair) => `${pair.left.id}\n${pair.right.id}`));
  const transitions = plan.transitions.map((transition) => (
    pairKeys.has(`${transition.leftSegmentId}\n${transition.rightSegmentId}`)
      ? { ...transition, cutTime: transition.cutTime + delta }
      : transition
  ));

  return finalizePlan({ ...plan, segments, transitions }, clips);
}

export function setSegmentLocked(
  plan: EditPlan,
  segmentId: string,
  locked: boolean,
): EditPlan {
  const selected = requireSegment(plan, segmentId);
  const targetIds = new Set(linkedSegments(plan, selected).map((segment) => segment.id));

  return {
    ...plan,
    segments: plan.segments.map((segment) => (
      targetIds.has(segment.id)
        ? { ...segment, locked }
        : segment
    )),
  };
}

export function setCutTransition(
  plan: EditPlan,
  clips: ClipMap,
  leftSegmentId: string,
  rightSegmentId: string,
  kind: EditTransitionKind | null,
  options: { duration?: number; alignment?: number } = {},
): EditPlan {
  const left = requireSegment(plan, leftSegmentId);
  const right = requireSegment(plan, rightSegmentId);
  if (Math.abs(left.timelineEnd - right.timelineStart) > EPSILON) {
    throw new Error('Transition requires adjacent segments.');
  }

  const pairs = linkedBoundaryPairs(plan, left, right);
  const pairKeys = new Set(pairs.map((pair) => `${pair.left.id}\n${pair.right.id}`));
  let transitions = plan.transitions.filter(
    (transition) => !pairKeys.has(`${transition.leftSegmentId}\n${transition.rightSegmentId}`),
  );

  if (kind) {
    const duration = clamp(options.duration ?? 0.32, 0.1, 1.5);
    const alignment = clamp(options.alignment ?? 0.5, 0, 1);

    transitions = transitions.concat(pairs.map((pair) => ({
      id: `transition-${pair.left.id}-${pair.right.id}-${kind}`,
      kind,
      leftSegmentId: pair.left.id,
      rightSegmentId: pair.right.id,
      cutTime: pair.left.timelineEnd,
      duration,
      alignment,
      reason: 'manual transition',
      motifId: pair.left.motifId,
    })));
  }

  const next = finalizePlan({ ...plan, transitions }, clips);
  const transitionIds = new Set(next.transitions.map((transition) => transition.id));

  return {
    ...next,
    motifs: next.motifs.map((motif) => ({
      ...motif,
      transitionIds: [
        ...new Set([
          ...motif.transitionIds.filter((id) => transitionIds.has(id)),
          ...next.transitions
            .filter(
              (transition) =>
                transition.motifId === motif.id
                && motif.segmentIds.includes(transition.leftSegmentId)
                && motif.segmentIds.includes(transition.rightSegmentId),
            )
            .map((transition) => transition.id),
        ]),
      ],
    })),
  };
}

export function snapTimeToMusic(
  music: MusicMap,
  time: number,
  mode: 'beat' | 'downbeat' = 'beat',
) {
  const candidates = mode === 'downbeat'
    ? music.beats.filter((beat) => beat.downbeat)
    : music.beats;

  if (!candidates.length) return clamp(time, 0, music.duration);

  let closest = candidates[0]!;
  let distance = Math.abs(closest.time - time);
  for (const beat of candidates.slice(1)) {
    const candidateDistance = Math.abs(beat.time - time);
    if (candidateDistance < distance) {
      closest = beat;
      distance = candidateDistance;
    }
  }

  return clamp(closest.time, 0, music.duration);
}
