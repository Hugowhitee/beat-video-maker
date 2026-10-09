export function resolveBeatGridDensity(
  beatSpacingPx: number,
  barSpacingPx: number,
  minimumLabelSpacingPx = 64,
) {
  const safeBeatSpacing = Math.max(0, beatSpacingPx)
  const safeBarSpacing = Math.max(0, barSpacingPx)
  const barStride =
    safeBarSpacing >= 32
      ? 1
      : safeBarSpacing >= 16
        ? 2
        : safeBarSpacing >= 8
          ? 4
          : safeBarSpacing >= 4
            ? 8
            : 16
  const labelStride =
    safeBarSpacing >= minimumLabelSpacingPx
      ? 1
      : safeBarSpacing >= minimumLabelSpacingPx / 2
        ? 2
        : safeBarSpacing >= minimumLabelSpacingPx / 4
          ? 4
          : safeBarSpacing >= minimumLabelSpacingPx / 8
            ? 8
            : 16

  return {
    showIndividualBeats: safeBeatSpacing >= 9 && safeBarSpacing >= 28 && barStride === 1,
    barStride,
    labelStride: Math.max(barStride, labelStride),
  }
}
