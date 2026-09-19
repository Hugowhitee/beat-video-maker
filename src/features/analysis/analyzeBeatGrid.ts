import { guess } from 'web-audio-beat-detector';
import type {
  AnalysisConfidence,
  BeatGridAnalysis,
  PrimaryBeatEstimate,
} from './types';

type WorkerResponse =
  | { ok: true; result: PrimaryBeatEstimate }
  | { ok: false; error: string };

function monoCopy(buffer: AudioBuffer) {
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      mono[index] += data[index] / buffer.numberOfChannels;
    }
  }
  return mono;
}

function primaryAnalysis(buffer: AudioBuffer) {
  return new Promise<PrimaryBeatEstimate>((resolve, reject) => {
    const worker = new Worker(new URL('./beatAnalyzer.worker.ts', import.meta.url), { type: 'module' });
    const samples = monoCopy(buffer);

    const cleanup = () => worker.terminate();
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || 'Beat analysis worker failed.'));
    };
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      cleanup();
      if (event.data.ok) resolve(event.data.result);
      else reject(new Error(event.data.error));
    };
    worker.postMessage({ samples, sampleRate: buffer.sampleRate }, [samples.buffer]);
  });
}

function closestTempo(reference: number, candidate: number) {
  const options = [candidate / 2, candidate, candidate * 2]
    .filter((value) => value >= 55 && value <= 220);
  return options.sort(
    (left, right) => Math.abs(left - reference) - Math.abs(right - reference),
  )[0] ?? candidate;
}

function offsetDistance(first: number, second: number, period: number) {
  const raw = Math.abs(first - second) % period;
  return Math.min(raw, period - raw);
}

function preferCanonicalTempo(primary: number, crossCheck: number) {
  const inMiddleBand = (value: number) => value >= 80 && value <= 180;
  if (inMiddleBand(crossCheck) && !inMiddleBand(primary)) return crossCheck;
  if (inMiddleBand(primary) && !inMiddleBand(crossCheck)) return primary;
  return primary;
}

function confidenceLevel(
  tempoConfidence: number,
  phaseConfidence: number,
  agreement: BeatGridAnalysis['agreement'],
): AnalysisConfidence {
  const score = tempoConfidence * 0.6 + phaseConfidence * 0.4;
  if (agreement === 'agree' && score >= 0.68) return 'high';
  if ((agreement === 'agree' || agreement === 'half-double') && score >= 0.46) return 'medium';
  if (score >= 0.6) return 'medium';
  return 'low';
}

export async function analyzeBeatGrid(buffer: AudioBuffer): Promise<BeatGridAnalysis> {
  const notes: string[] = [];
  const primaryPromise = primaryAnalysis(buffer);
  const crossCheckPromise = guess(buffer, { minTempo: 55, maxTempo: 220 })
    .then((result) => ({
      bpm: result.bpm,
      offset: result.offset,
    }))
    .catch(() => null);

  const [primary, crossCheck] = await Promise.all([primaryPromise, crossCheckPromise]);

  if (primary.bpm === null || primary.beatOffset === null) {
    if (!crossCheck) {
      return {
        ...primary,
        confidence: 'low',
        crossCheckBpm: null,
        crossCheckOffset: null,
        agreement: 'unavailable',
        notes: ['No reliable tempo candidate was found.'],
      };
    }

    notes.push('Only the independent tempo detector returned a candidate; verify it manually.');
    return {
      ...primary,
      bpm: crossCheck.bpm,
      beatOffset: crossCheck.offset,
      tempoConfidence: Math.max(primary.tempoConfidence, 0.35),
      phaseConfidence: Math.max(primary.phaseConfidence, 0.3),
      confidence: 'low',
      crossCheckBpm: crossCheck.bpm,
      crossCheckOffset: crossCheck.offset,
      agreement: 'unavailable',
      notes,
    };
  }

  if (!crossCheck) {
    notes.push('Independent tempo cross-check was unavailable.');
    return {
      ...primary,
      confidence: confidenceLevel(primary.tempoConfidence, primary.phaseConfidence, 'unavailable'),
      crossCheckBpm: null,
      crossCheckOffset: null,
      agreement: 'unavailable',
      notes,
    };
  }

  const alignedCross = closestTempo(primary.bpm, crossCheck.bpm);
  const relativeDifference = Math.abs(alignedCross - primary.bpm) / primary.bpm;
  const directDifference = Math.abs(crossCheck.bpm - primary.bpm) / primary.bpm;
  const agreement: BeatGridAnalysis['agreement'] =
    directDifference <= 0.025 ? 'agree'
      : relativeDifference <= 0.025 ? 'half-double'
        : 'disagree';

  let tempoConfidence = primary.tempoConfidence;
  let phaseConfidence = primary.phaseConfidence;
  let bpm = primary.bpm;
  let beatOffset = primary.beatOffset;
  let barOffset = primary.barOffset;
  let barConfidence = primary.barConfidence;

  if (agreement === 'agree') {
    tempoConfidence = Math.min(1, tempoConfidence + 0.18);
    const period = 60 / primary.bpm;
    const alignedOffset = crossCheck.offset % period;
    const distance = offsetDistance(primary.beatOffset, alignedOffset, period);
    if (distance <= Math.min(0.065, period * 0.12)) {
      phaseConfidence = Math.min(1, phaseConfidence + 0.14);
    }
  } else if (agreement === 'half-double') {
    const canonical = preferCanonicalTempo(primary.bpm, crossCheck.bpm);
    tempoConfidence = Math.min(0.72, tempoConfidence + 0.08);

    if (canonical !== primary.bpm) {
      bpm = canonical;
      beatOffset = crossCheck.offset % (60 / canonical);
      phaseConfidence = Math.max(0.38, Math.min(0.68, phaseConfidence));
      barOffset = null;
      barConfidence = 0;
      notes.push(
        'Half/double-time ambiguity resolved to '
        + canonical.toFixed(1)
        + ' BPM; verify bar 1 before phrase-synchronised motion.',
      );
    } else {
      notes.push('Half/double-time ambiguity detected; verify BPM and bar 1.');
      barConfidence = Math.min(barConfidence, 0.3);
    }
  } else {
    tempoConfidence *= 0.7;
    notes.push(
      'Tempo estimators disagree (' + primary.bpm.toFixed(1) + ' vs ' + crossCheck.bpm.toFixed(1) + ' BPM).',
    );
  }

  if (barConfidence < 0.35) {
    notes.push('Bar 1 is weakly inferred; check it before using bar-synchronised motion.');
  }

  return {
    ...primary,
    bpm,
    beatOffset,
    barOffset,
    barConfidence,
    tempoConfidence,
    phaseConfidence,
    confidence: confidenceLevel(tempoConfidence, phaseConfidence, agreement),
    crossCheckBpm: crossCheck.bpm,
    crossCheckOffset: crossCheck.offset,
    agreement,
    notes,
  };
}
