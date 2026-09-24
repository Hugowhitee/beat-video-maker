import type {
  BeatvideoGridCorrectionAnchor,
  BeatvideoGridMode,
  BeatvideoMusicAnalysis,
  MusicBeat,
  MusicMap,
  MusicSection,
} from '@/types/beatvideo'

const EPSILON = 1e-6
const ANCHOR_EPSILON = 1e-4

function clampToDuration(time: number, duration: number) {
  return Math.max(0, Math.min(duration, time))
}

export function getBeatvideoGridMode(analysis: BeatvideoMusicAnalysis): BeatvideoGridMode {
  if (analysis.version === 1) {
    return analysis.bpmOverride !== null ? 'fixed' : 'detected'
  }
  return analysis.gridMode ?? (analysis.bpmOverride !== null ? 'fixed' : 'detected')
}

function normalizeAnchors(
  analysis: BeatvideoMusicAnalysis,
): BeatvideoGridCorrectionAnchor[] {
  const anchors: BeatvideoGridCorrectionAnchor[] = []

  if (
    analysis.detectedBarOneTime !== null &&
    analysis.barOneTime !== null &&
    Math.abs(analysis.barOneTime - analysis.detectedBarOneTime) > EPSILON
  ) {
    anchors.push({
      id: 'bar-one',
      sourceTime: analysis.detectedBarOneTime,
      correctedTime: analysis.barOneTime,
    })
  }

  if (analysis.version >= 2) {
    for (const anchor of analysis.correctionAnchors ?? []) {
      if (
        !Number.isFinite(anchor.sourceTime) ||
        !Number.isFinite(anchor.correctedTime) ||
        Math.abs(anchor.correctedTime - anchor.sourceTime) <= EPSILON
      ) {
        continue
      }
      anchors.push(anchor)
    }
  }

  anchors.sort((left, right) => left.sourceTime - right.sourceTime)

  const merged: BeatvideoGridCorrectionAnchor[] = []
  for (const anchor of anchors) {
    const previous = merged.at(-1)
    if (previous && Math.abs(previous.sourceTime - anchor.sourceTime) <= ANCHOR_EPSILON) {
      merged[merged.length - 1] = anchor
    } else {
      merged.push(anchor)
    }
  }
  return merged
}

function warpDetectedTime(time: number, anchors: BeatvideoGridCorrectionAnchor[]): number {
  if (anchors.length === 0) return time
  if (anchors.length === 1) {
    const anchor = anchors[0]!
    return time + (anchor.correctedTime - anchor.sourceTime)
  }

  const first = anchors[0]!
  const last = anchors.at(-1)!

  if (time <= first.sourceTime) {
    return time + (first.correctedTime - first.sourceTime)
  }
  if (time >= last.sourceTime) {
    return time + (last.correctedTime - last.sourceTime)
  }

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const left = anchors[index]!
    const right = anchors[index + 1]!
    if (time < left.sourceTime || time > right.sourceTime) continue

    const sourceSpan = right.sourceTime - left.sourceTime
    if (sourceSpan <= EPSILON) {
      return time + (left.correctedTime - left.sourceTime)
    }

    const ratio = (time - left.sourceTime) / sourceSpan
    return left.correctedTime + ratio * (right.correctedTime - left.correctedTime)
  }

  return time
}

function warpSection(
  section: MusicSection,
  anchors: BeatvideoGridCorrectionAnchor[],
  duration: number,
): MusicSection {
  const start = clampToDuration(warpDetectedTime(section.start, anchors), duration)
  const end = clampToDuration(warpDetectedTime(section.end, anchors), duration)
  return {
    ...section,
    start: Math.min(start, end),
    end: Math.max(start, end),
  }
}

function buildDetectedGrid(analysis: BeatvideoMusicAnalysis): MusicMap {
  const source = analysis.musicMap
  const anchors = normalizeAnchors(analysis)
  if (anchors.length === 0) return source

  const beats = source.beats
    .map((beat) => ({
      ...beat,
      time: warpDetectedTime(beat.time, anchors),
    }))
    .filter((beat) => beat.time >= -EPSILON && beat.time <= source.duration + EPSILON)
    .map((beat) => ({
      ...beat,
      time: clampToDuration(beat.time, source.duration),
    }))
    .sort((left, right) => left.time - right.time)

  return {
    ...source,
    beats,
    sections: source.sections.map((section) => warpSection(section, anchors, source.duration)),
  }
}

function buildTempoGrid(
  analysis: BeatvideoMusicAnalysis,
  bpm: number,
  anchor: number,
): MusicMap {
  const source = analysis.musicMap
  const beatSeconds = 60 / bpm
  const beatsPerBar = Math.max(1, source.beatsPerBar)
  const beats: MusicBeat[] = []

  const beatsBefore = Math.ceil(anchor / beatSeconds)
  const firstTime = anchor - beatsBefore * beatSeconds
  let logicalIndex = -beatsBefore

  for (
    let time = firstTime;
    time <= source.duration + EPSILON;
    time += beatSeconds, logicalIndex += 1
  ) {
    if (time < -EPSILON) continue
    const normalizedTime = clampToDuration(time, source.duration)
    const barOffset = ((logicalIndex % beatsPerBar) + beatsPerBar) % beatsPerBar
    beats.push({
      time: normalizedTime,
      index: logicalIndex,
      downbeat: barOffset === 0,
      strength: barOffset === 0 ? 1 : 0.55,
    })
  }

  return {
    ...source,
    bpm,
    beats,
  }
}

/**
 * Resolve the source-domain musical grid after user correction.
 *
 * Detected mode keeps Beat This timing and applies piecewise correction anchors.
 * Fixed mode deliberately creates an even tempo grid around the selected bar 1.
 * Timeline placement is resolved separately so moving/trimming the audio never
 * changes the source-domain correction evidence.
 */
export function resolveBeatvideoMusicGrid(analysis: BeatvideoMusicAnalysis): MusicMap {
  const source = analysis.musicMap
  const mode = getBeatvideoGridMode(analysis)

  if (mode === 'fixed') {
    const bpm = analysis.bpmOverride ?? source.bpm
    const anchor =
      analysis.barOneTime ??
      analysis.detectedBarOneTime ??
      source.beats.find((beat) => beat.downbeat)?.time ??
      source.beats[0]?.time ??
      null

    if (bpm && bpm > 0 && anchor !== null) {
      return buildTempoGrid(analysis, bpm, anchor)
    }
  }

  return buildDetectedGrid(analysis)
}
