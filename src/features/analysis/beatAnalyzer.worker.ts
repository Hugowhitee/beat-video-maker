import type { PrimaryBeatEstimate } from './types';

type AnalyzeRequest = {
  samples: Float32Array;
  sampleRate: number;
};

type Onset = {
  time: number;
  strength: number;
};

const TARGET_RATE = 11_025;
const MIN_BPM = 55;
const MAX_BPM = 220;

function downsample(samples: Float32Array, sampleRate: number) {
  if (sampleRate <= TARGET_RATE * 1.05) {
    return { samples, sampleRate };
  }

  const ratio = sampleRate / TARGET_RATE;
  const length = Math.max(1, Math.floor(samples.length / ratio));
  const output = new Float32Array(length);

  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(samples.length, Math.max(start + 1, Math.floor((index + 1) * ratio)));
    let sum = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
      sum += samples[sourceIndex];
    }
    output[index] = sum / Math.max(1, end - start);
  }

  return { samples: output, sampleRate: TARGET_RATE };
}

function frameEnvelope(samples: Float32Array, sampleRate: number) {
  const frameSize = 1024;
  const hopSize = 256;
  if (samples.length < frameSize) {
    return { flux: new Float32Array(0), energy: new Float32Array(0), hopSeconds: hopSize / sampleRate };
  }

  const frameCount = Math.floor((samples.length - frameSize) / hopSize) + 1;
  const energy = new Float32Array(frameCount);
  const flux = new Float32Array(frameCount);
  let previousLogEnergy = -20;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * hopSize;
    let sumSquares = 0;
    for (let index = 0; index < frameSize; index += 1) {
      const value = samples[start + index] || 0;
      sumSquares += value * value;
    }

    const rms = Math.sqrt(sumSquares / frameSize);
    const logEnergy = Math.log(rms + 1e-7);
    energy[frame] = rms;
    flux[frame] = Math.max(0, logEnergy - previousLogEnergy);
    previousLogEnergy = logEnergy;
  }

  const smoothed = new Float32Array(frameCount);
  for (let index = 0; index < frameCount; index += 1) {
    let sum = 0;
    let count = 0;
    for (let offset = -1; offset <= 1; offset += 1) {
      const candidate = index + offset;
      if (candidate < 0 || candidate >= frameCount) continue;
      sum += flux[candidate];
      count += 1;
    }
    smoothed[index] = count ? sum / count : flux[index];
  }

  return { flux: smoothed, energy, hopSeconds: hopSize / sampleRate };
}

function detectOnsets(flux: Float32Array, hopSeconds: number): Onset[] {
  const onsets: Onset[] = [];
  if (flux.length < 5) return onsets;

  const localRadius = Math.max(8, Math.round(0.8 / hopSeconds));
  const minimumGap = Math.max(1, Math.round(0.11 / hopSeconds));
  let lastFrame = -minimumGap;

  for (let index = 2; index < flux.length - 2; index += 1) {
    const start = Math.max(0, index - localRadius);
    const end = Math.min(flux.length, index + localRadius + 1);
    let mean = 0;
    for (let local = start; local < end; local += 1) mean += flux[local];
    mean /= Math.max(1, end - start);

    let variance = 0;
    for (let local = start; local < end; local += 1) {
      const delta = flux[local] - mean;
      variance += delta * delta;
    }
    const stdDev = Math.sqrt(variance / Math.max(1, end - start));
    const threshold = mean + stdDev * 0.7;
    const current = flux[index];

    const localMax =
      current >= flux[index - 1] &&
      current >= flux[index + 1] &&
      current >= flux[index - 2] &&
      current >= flux[index + 2];

    if (localMax && current > threshold && current > 0.025 && index - lastFrame >= minimumGap) {
      onsets.push({
        time: index * hopSeconds,
        strength: current,
      });
      lastFrame = index;
    }
  }

  const peak = Math.max(...onsets.map((onset) => onset.strength), 1e-6);
  return onsets.map((onset) => ({ ...onset, strength: onset.strength / peak }));
}

function tempoHistogram(onsets: Onset[]) {
  const step = 0.5;
  const bins = new Map<number, number>();

  for (let first = 0; first < onsets.length; first += 1) {
    for (let second = first + 1; second < Math.min(onsets.length, first + 9); second += 1) {
      const interval = onsets[second].time - onsets[first].time;
      if (interval <= 0) continue;
      const strength = Math.sqrt(onsets[first].strength * onsets[second].strength);

      for (let beats = 1; beats <= 4; beats += 1) {
        const bpm = (60 * beats) / interval;
        if (bpm < MIN_BPM || bpm > MAX_BPM) continue;
        const rounded = Math.round(bpm / step) * step;
        const distancePenalty = 1 / Math.sqrt(beats);
        bins.set(rounded, (bins.get(rounded) || 0) + strength * distancePenalty);
      }
    }
  }

  return [...bins.entries()]
    .map(([bpm, score]) => ({ bpm, score }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 20);
}

function circularDistance(time: number, offset: number, period: number) {
  const raw = Math.abs(((time - offset) % period + period) % period);
  return Math.min(raw, period - raw);
}

function phaseScore(onsets: Onset[], bpm: number) {
  const period = 60 / bpm;
  const steps = 72;
  const sigma = period * 0.075;
  let bestOffset = 0;
  let best = -Infinity;
  let second = -Infinity;

  for (let step = 0; step < steps; step += 1) {
    const offset = (step / steps) * period;
    let score = 0;
    for (const onset of onsets) {
      const distance = circularDistance(onset.time, offset, period);
      const closeness = Math.exp(-(distance * distance) / (2 * sigma * sigma));
      score += onset.strength * closeness;
    }

    if (score > best) {
      second = best;
      best = score;
      bestOffset = offset;
    } else if (score > second) {
      second = score;
    }
  }

  const possible = onsets.reduce((sum, onset) => sum + onset.strength, 0) || 1;
  const normalized = Math.min(1, best / possible);
  const separation = best > 0 ? Math.max(0, (best - Math.max(0, second)) / best) : 0;

  return {
    offset: bestOffset,
    score: normalized,
    separation,
  };
}

function chooseTempo(onsets: Onset[]) {
  const candidates = tempoHistogram(onsets);
  if (!candidates.length) return null;

  const histogramPeak = Math.max(candidates[0]?.score || 0, 1e-6);
  const scored = candidates.map((candidate) => {
    const phase = phaseScore(onsets, candidate.bpm);
    const histogramEvidence = candidate.score / histogramPeak;
    const combined = histogramEvidence * 0.35 + phase.score * 0.65;
    return { ...candidate, phase, combined };
  }).sort((left, right) => right.combined - left.combined);

  const best = scored[0];
  const second = scored[1];
  const histogramSeparation = second
    ? Math.max(0, (best.combined - second.combined) / Math.max(best.combined, 1e-6))
    : 1;

  const tempoConfidence = Math.max(
    0,
    Math.min(1, best.phase.score * 0.65 + histogramSeparation * 0.35),
  );

  return {
    bpm: best.bpm,
    beatOffset: best.phase.offset,
    tempoConfidence,
    phaseConfidence: Math.max(0, Math.min(1, best.phase.score * 0.8 + best.phase.separation * 0.2)),
  };
}

function nearestFrame(time: number, hopSeconds: number, length: number) {
  return Math.max(0, Math.min(length - 1, Math.round(time / hopSeconds)));
}

function estimateBarOffset(
  bpm: number,
  beatOffset: number,
  duration: number,
  energy: Float32Array,
  flux: Float32Array,
  hopSeconds: number,
) {
  const beatPeriod = 60 / bpm;
  const phaseScores = [0, 0, 0, 0];
  const phaseCounts = [0, 0, 0, 0];

  let beatIndex = 0;
  for (let time = beatOffset; time < duration; time += beatPeriod) {
    const frame = nearestFrame(time, hopSeconds, energy.length);
    const localEnergy = energy[frame] || 0;
    const localFlux = flux[frame] || 0;
    const phase = ((beatIndex % 4) + 4) % 4;
    phaseScores[phase] += Math.log1p(localEnergy * 20) + localFlux * 0.6;
    phaseCounts[phase] += 1;
    beatIndex += 1;
  }

  for (let phase = 0; phase < 4; phase += 1) {
    if (phaseCounts[phase]) phaseScores[phase] /= phaseCounts[phase];
  }

  const ranked = phaseScores
    .map((score, phase) => ({ score, phase }))
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  const second = ranked[1];
  const confidence = best.score > 0
    ? Math.max(0, Math.min(1, (best.score - second.score) / best.score * 2.5))
    : 0;

  let barOffset = beatOffset + best.phase * beatPeriod;
  while (barOffset - beatPeriod * 4 >= 0) barOffset -= beatPeriod * 4;

  return { barOffset, barConfidence: confidence };
}

function analyze({ samples, sampleRate }: AnalyzeRequest): PrimaryBeatEstimate {
  const prepared = downsample(samples, sampleRate);
  const { flux, energy, hopSeconds } = frameEnvelope(prepared.samples, prepared.sampleRate);
  const onsets = detectOnsets(flux, hopSeconds);

  if (onsets.length < 6) {
    return {
      bpm: null,
      beatOffset: null,
      barOffset: null,
      tempoConfidence: 0,
      phaseConfidence: 0,
      barConfidence: 0,
      onsetCount: onsets.length,
    };
  }

  const tempo = chooseTempo(onsets);
  if (!tempo) {
    return {
      bpm: null,
      beatOffset: null,
      barOffset: null,
      tempoConfidence: 0,
      phaseConfidence: 0,
      barConfidence: 0,
      onsetCount: onsets.length,
    };
  }

  const duration = prepared.samples.length / prepared.sampleRate;
  const bar = estimateBarOffset(
    tempo.bpm,
    tempo.beatOffset,
    duration,
    energy,
    flux,
    hopSeconds,
  );

  return {
    bpm: tempo.bpm,
    beatOffset: tempo.beatOffset,
    barOffset: bar.barOffset,
    tempoConfidence: tempo.tempoConfidence,
    phaseConfidence: tempo.phaseConfidence,
    barConfidence: bar.barConfidence,
    onsetCount: onsets.length,
  };
}

self.onmessage = (event: MessageEvent<AnalyzeRequest>) => {
  try {
    const result = analyze(event.data);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'Beat analysis failed.',
    });
  }
};
