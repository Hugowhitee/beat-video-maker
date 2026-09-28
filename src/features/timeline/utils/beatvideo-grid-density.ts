export function resolveBeatGridDensity(
  beatSpacingPx: number,
  barSpacingPx: number,
) {
  const safeBeatSpacing = Math.max(0, beatSpacingPx)
  const safeBarSpacing = Math.max(0, barSpacingPx)
  const barStride =
    safeBarSpacing >= 32 ? 1 :
    safeBarSpacing >= 16 ? 2 :
    safeBarSpacing >= 8 ? 4 :
    safeBarSpacing >= 4 ? 8 : 16
  const labelStride =
    safeBarSpacing >= 64 ? 1 :
    safeBarSpacing >= 32 ? 2 :
    safeBarSpacing >= 16 ? 4 :
    safeBarSpacing >= 8 ? 8 : 16

  return {
    showIndividualBeats:
      safeBeatSpacing >= 9 && safeBarSpacing >= 28 && barStride === 1,
    barStride,
    labelStride: Math.max(barStride, labelStride),
  }
}
