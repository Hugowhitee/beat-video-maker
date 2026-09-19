import type { VerifiedGrid } from './types';

function positiveModulo(value: number, modulo: number) {
  return ((value % modulo) + modulo) % modulo;
}

export function beatPeriod(grid: Pick<VerifiedGrid, 'bpm'>) {
  return 60 / grid.bpm;
}

export function beatPhaseAt(time: number, grid: Pick<VerifiedGrid, 'bpm' | 'beatOffset'>) {
  const period = beatPeriod(grid);
  return positiveModulo(time - grid.beatOffset, period) / period;
}

export function beatIndexAt(time: number, grid: Pick<VerifiedGrid, 'bpm' | 'beatOffset'>) {
  const period = beatPeriod(grid);
  return Math.floor((time - grid.beatOffset) / period);
}

export function barPhaseAt(time: number, grid: VerifiedGrid) {
  const period = beatPeriod(grid);
  const origin = grid.barOffset ?? grid.beatOffset;
  return positiveModulo(time - origin, period * 4) / (period * 4);
}

export function barIndexAt(time: number, grid: VerifiedGrid) {
  const period = beatPeriod(grid);
  const origin = grid.barOffset ?? grid.beatOffset;
  return Math.floor((time - origin) / (period * 4));
}

export function markersForDuration(duration: number, grid: Pick<VerifiedGrid, 'bpm' | 'beatOffset'>) {
  const period = beatPeriod(grid);
  const markers: number[] = [];
  let time = grid.beatOffset;

  while (time - period >= 0) time -= period;
  while (time < 0) time += period;

  for (; time <= duration + 1e-6; time += period) {
    markers.push(time);
  }

  return markers;
}
