import { expect, test } from '@playwright/test';
import {
  placementFromPoint,
  placementPreset,
  TITLE_PLACEMENT_KEYS,
} from '../src/features/project/titlePlacement';

test('title placement grid covers all nine anchor positions', () => {
  expect(TITLE_PLACEMENT_KEYS).toEqual([
    'top-left',
    'top-center',
    'top-right',
    'middle-left',
    'center',
    'middle-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
  ]);

  expect(placementPreset('center')).toEqual({
    x: 0.5,
    y: 0.5,
    align: 'center',
  });
  expect(placementPreset('top-right').align).toBe('right');
  expect(placementPreset('bottom-left').align).toBe('left');
});

test('direct canvas placement clamps safely and chooses a useful text anchor', () => {
  const rect = { left: 100, top: 50, width: 1000, height: 500 };

  expect(placementFromPoint(600, 300, rect)).toEqual({
    x: 0.5,
    y: 0.5,
    align: 'center',
  });

  const left = placementFromPoint(20, 10, rect);
  expect(left.x).toBe(0.02);
  expect(left.y).toBe(0.06);
  expect(left.align).toBe('left');

  const right = placementFromPoint(1200, 700, rect);
  expect(right.x).toBe(0.98);
  expect(right.y).toBe(0.94);
  expect(right.align).toBe('right');
});
