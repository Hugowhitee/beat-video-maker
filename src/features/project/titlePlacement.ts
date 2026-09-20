import type { TitleAlign } from '../compositor/types';

export type TitlePlacementKey =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type TitlePlacement = {
  x: number;
  y: number;
  align: TitleAlign;
};

const PRESETS: Record<TitlePlacementKey, TitlePlacement> = {
  'top-left': { x: 0.07, y: 0.12, align: 'left' },
  'top-center': { x: 0.5, y: 0.12, align: 'center' },
  'top-right': { x: 0.93, y: 0.12, align: 'right' },
  'middle-left': { x: 0.07, y: 0.5, align: 'left' },
  center: { x: 0.5, y: 0.5, align: 'center' },
  'middle-right': { x: 0.93, y: 0.5, align: 'right' },
  'bottom-left': { x: 0.07, y: 0.88, align: 'left' },
  'bottom-center': { x: 0.5, y: 0.88, align: 'center' },
  'bottom-right': { x: 0.93, y: 0.88, align: 'right' },
};

export const TITLE_PLACEMENT_KEYS = Object.keys(PRESETS) as TitlePlacementKey[];

export function placementPreset(key: TitlePlacementKey): TitlePlacement {
  return PRESETS[key];
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function placementFromPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): TitlePlacement {
  if (rect.width <= 0 || rect.height <= 0) {
    return PRESETS.center;
  }

  const x = clamp((clientX - rect.left) / rect.width, 0.02, 0.98);
  const y = clamp((clientY - rect.top) / rect.height, 0.06, 0.94);
  const align: TitleAlign = x < 0.34 ? 'left' : x > 0.66 ? 'right' : 'center';

  return { x, y, align };
}
