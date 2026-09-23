import type { BeatvideoMusicAnalysis, MusicBeat, MusicMap } from '@/types/beatvideo'

const EPSILON = 1e-6

function clampToDuration(time: number, duration: number) {
  return Math.max(0, Math.min(duration, time))
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

  // Walk backwards from bar 1 to the first beat inside the project.
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
      index: beats.length,
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
 * Resolve the musical grid that should be shown/used after user correction.
 *
 * Beat This remains the analysis owner. Beatvideo only shifts phase when bar 1
 * is corrected, or analytically rebuilds the grid when the user explicitly
 * overrides tempo. The returned map never mutates the stored model evidence.
 */
export function resolveBeatvideoMusicGrid(analysis: BeatvideoMusicAnalysis): MusicMap {
  const source = analysis.musicMap
  const bpm = analysis.bpmOverride ?? source.bpm

  if (analysis.bpmOverride !== null && bpm && bpm > 0 && analysis.barOneTime !== null) {
    return buildTempoGrid(analysis, bpm, analysis.barOneTime)
  }

  const detected = analysis.detectedBarOneTime
  const anchor = analysis.barOneTime
  if (detected === null || anchor === null || Math.abs(anchor - detected) <= EPSILON) {
    return analysis.bpmOverride !== null ? { ...source, bpm } : source
  }

  const shift = anchor - detected
  const beats = source.beats
    .map((beat) => ({ ...beat, time: beat.time + shift }))
    .filter((beat) => beat.time >= -EPSILON && beat.time <= source.duration + EPSILON)
    .map((beat, index) => ({
      ...beat,
      time: clampToDuration(beat.time, source.duration),
      index,
    }))

  return {
    ...source,
    bpm,
    beats,
  }
}
