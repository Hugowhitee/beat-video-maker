import { guess } from 'web-audio-beat-detector';
import type { BeatGridAnalysis } from './types';

const TEMPO_SETTINGS = {
  minTempo: 55,
  maxTempo: 220,
};

type UpstreamGuess = {
  bpm: number;
  offset: number;
};

async function guessRange(
  buffer: AudioBuffer,
  offset?: number,
  duration?: number,
): Promise<UpstreamGuess | null> {
  try {
    const result = offset === undefined || duration === undefined
      ? await guess(buffer, TEMPO_SETTINGS)
      : await guess(buffer, offset, duration, TEMPO_SETTINGS);

    if (
      !Number.isFinite(result.bpm)
      || !Number.isFinite(result.offset)
       || result.bpm < TEMPO_SETTINGS.minTempo
      || result.bpm > TEMPO_SETTINGS.maxTempo
    ) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

function closestTempo(reference: number, candidate: number) {
  const options = [candidate / 2, candidate, candidate * 2]
    .filter((value) => value >= TEMPO_SETTINGS.minTempo && value <= TEMPO_SETTINGS.maxTempo);

  return options.sort(
    (left, right) => Math.abs(left - reference) - Math.abs(right - reference),
  )[0] ?? candidate;
}

function tempoAgrees(reference: number, candidate: number) {
  const aligned = closestTempo(reference, candidate);
  return Math.abs(aligned - reference) / reference <= 0.025;
}

function segmentRanges(duration: number) {
  if (!Number.isFinite(duration) || duration < 8) return [];

  const windowDuration = Math.min(30, Math.max(8, duration * 0.45));
  const latestStart = Math.max(0, duration - windowDuration);
  const starts = [0, latestStart / 2, latestStart];

  const uniqueStarts = starts.filter(
    (start, index) => starts.findIndex((candidate) => Math.abs(candidate - start) < 0.25) === index,
  );

  return uniqueStarts
    .slice(0, 3)
    .map((offset) => ({
      offset,
      duration: Math.min(windowDuration, duration - offset),
    }))
    .filter((range) => range.duration >= 6);
}

export async function analyzeBeatGrid(buffer: AudioBuffer): Promise<BeatGridAnalysis> {
  const primary = await guessRange(buffer);

  if (!primary) {
    return {
      bpm: null,
      beatOffset: null,
      barOffset: null,
      barConfidence: 0,
      confidence: 'low',
      detector: 'web-audio-beat-detector',
      segmentBpms: [],
      notes: ['No reliable tempo candidate was found. Enter BPM and bar 1 manually.'],
    };
  }

  const ranges = segmentRanges(buffer.duration);
  const segmentResults = await Promise.all(
    ranges.map((range) => guessRange(buffer, range.offset, range.duration)),
  );
  const segmentBpms = segmentResults
    .filter((result): result is UpstreamGuess => result !== null)
    .map((result) => result.bpm);

  const stableSegments = segmentBpms.filter((bpm) => tempoAgrees(primary.bpm, bpm)).length;
  const allAvailableSegmentsAgree =
    segmentBpms.length >= 2 && stableSegments === segmentBpms.length;

  const notes: string[] = [];
  if (allAvailableSegmentsAgree) {
    notes.push('Tempo is consistent across multiple parts of the beat.');
  } else if (segmentBpms.length > 0) {
    notes.push('Tempo varies across detector windows; verify BPM manually.');
  } else {
    notes.push('Tempo was detected from the full beat; verify BPM manually.');
  }
  notes.push('Bar 1 is intentionally manual; set it before phrase-synchronised motion.');

  return {
    bpm: primary.bpm,
    beatOffset: Math.max(0, primary.offset),
    barOffset: null,
    barConfidence: 0,
    confidence: allAvailableSegmentsAgree ? 'medium' : 'low',
    detector: 'web-audio-beat-detector',
    segmentBpms,
    notes,
  };
}
