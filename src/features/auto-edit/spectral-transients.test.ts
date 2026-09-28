// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import { deriveSpectralTransients } from './spectral-transients'

function setBand(
  spectrogram: Float32Array,
  frame: number,
  from: number,
  to: number,
  value: number,
  melBins = 128,
) {
  for (let bin = from; bin < to; bin += 1) {
    spectrogram[frame * melBins + bin] = value
  }
}

describe('deriveSpectralTransients', () => {
  it('separates low and high attacks without pretending they are instruments', () => {
    const frames = 12
    const melBins = 128
    const spectrogram = new Float32Array(frames * melBins)

    setBand(spectrogram, 3, 0, 32, 2)
    setBand(spectrogram, 4, 0, 32, 2)
    setBand(spectrogram, 8, 80, 128, 3)
    setBand(spectrogram, 9, 80, 128, 3)

    const transients = deriveSpectralTransients({
      spectrogram,
      frames,
      fps: 50,
      melBins,
    })

    expect(transients).toHaveLength(2)
    expect(transients[0]?.time).toBeCloseTo(3 / 50)
    expect(transients[0]?.low).toBeGreaterThan(0.9)
    expect(transients[0]?.high).toBe(0)
    expect(transients[1]?.time).toBeCloseTo(8 / 50)
    expect(transients[1]?.high).toBeGreaterThan(0.9)
    expect(transients[1]?.low).toBe(0)
  })

  it('does not invent repeated low-end hits from one sustained 808 note', () => {
    const frames = 14
    const melBins = 128
    const spectrogram = new Float32Array(frames * melBins)

    for (let frame = 3; frame <= 9; frame += 1) {
      setBand(spectrogram, frame, 0, 32, 3)
    }

    const transients = deriveSpectralTransients({
      spectrogram,
      frames,
      fps: 50,
      melBins,
    })

    expect(transients).toHaveLength(1)
    expect(transients[0]?.time).toBeCloseTo(3 / 50)
    expect(transients[0]?.low).toBeGreaterThan(0.9)
  })

  it('keeps a layered kick and snare onset as one timing event', () => {
    const frames = 10
    const melBins = 128
    const spectrogram = new Float32Array(frames * melBins)

    setBand(spectrogram, 4, 0, 32, 3)
    setBand(spectrogram, 4, 32, 80, 2.5)
    setBand(spectrogram, 5, 0, 80, 2.5)

    const transients = deriveSpectralTransients({
      spectrogram,
      frames,
      fps: 50,
      melBins,
      minGapFrames: 3,
    })

    expect(transients).toHaveLength(1)
    expect(transients[0]?.low).toBeGreaterThan(0.9)
    expect(transients[0]?.mid).toBeGreaterThan(0.9)
  })

  it('deduplicates adjacent multi-band peaks into one event', () => {
    const frames = 8
    const melBins = 128
    const spectrogram = new Float32Array(frames * melBins)

    setBand(spectrogram, 3, 0, 32, 2)
    setBand(spectrogram, 4, 80, 128, 4)

    const transients = deriveSpectralTransients({
      spectrogram,
      frames,
      fps: 50,
      melBins,
      minGapFrames: 3,
    })

    expect(transients).toHaveLength(1)
    expect(transients[0]?.strength).toBeGreaterThan(0.9)
  })
})
